/**
 * Ties generation together: generate -> parse -> validate -> retry once.
 *
 * "Garbage returned", "empty course returned" and "network dropped" must never
 * collapse into one log line — they have three different fixes. The retry
 * covers upstream failure as well as bad content, because maxRetries: 0 leaves
 * nothing else between a network blip and a failed demo.
 */

import { generateJSON } from './openai.js';
import { courseMessages } from './prompts.js';
import { courseDecisionSchema, COURSE_DECISION_SCHEMA_NAME } from './schemas.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { trace, traceError } from '../middlewares/trace.js';
import { generationTracker } from './generationTracking.js';

/** Milestone contract. Also stated in the prompt. */
const MODULES_MIN = 3;
const MODULES_MAX = 6;
const LESSONS_MIN = 3;
const LESSONS_MAX = 5;

/** A "tag" longer than this, or containing a comma, is not a tag. */
const MAX_TAG_LENGTH = 30;

function hasExactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * Check a parsed course against what the schema cannot express.
 *
 * Returns strings rather than throwing: the caller decides whether a violation
 * is worth a retry, and the strings are fed back to the model verbatim, so they
 * must read as instructions it can act on.
 *
 * @param {object} course  parsed output of parseAIJson
 * @returns {string[]}     empty means valid
 */
export function validateCourse(course) {
  // Collect ALL violations, never return on the first. One retry carrying three
  // corrections beats three round trips at ~5s each.
  const problems = [];

  if (!hasExactKeys(course, ['title', 'description', 'tags', 'modules'])) {
    return ['the course must have exactly title, description, tags, and modules'];
  }
  if (typeof course.description !== 'string') problems.push('the description must be a string');

  // Strict mode has no optional fields, so the key always exists — an empty
  // string is the realistic failure, not a missing key.
  if (typeof course?.title !== 'string' || course.title.trim() === '') {
    problems.push('the course title is empty - give the course a real title');
  }

  // Return early: everything below would throw on a non-array.
  if (!Array.isArray(course?.modules)) {
    problems.push('modules is missing or is not a list');
    return problems;
  }

  if (course.modules.length < MODULES_MIN || course.modules.length > MODULES_MAX) {
    problems.push(
      `the course has ${course.modules.length} modules - it must have between ${MODULES_MIN} and ${MODULES_MAX}`
    );
  }

  // Every message names the position: "module 3" is actionable, "a module" is not.
  course.modules.forEach((module, i) => {
    const where = `module ${i + 1}`;

    if (!hasExactKeys(module, ['title', 'lessons'])) {
      problems.push(`${where} must have exactly title and lessons`);
      return;
    }

    if (typeof module?.title !== 'string' || module.title.trim() === '') {
      problems.push(`${where} has an empty title`);
    }

    if (!Array.isArray(module?.lessons)) {
      problems.push(`${where} has no lessons list`);
      return;
    }

    if (module.lessons.length < LESSONS_MIN || module.lessons.length > LESSONS_MAX) {
      problems.push(
        `${where} has ${module.lessons.length} lessons - each module must have between ${LESSONS_MIN} and ${LESSONS_MAX}`
      );
    }

    module.lessons.forEach((lesson, j) => {
      if (!hasExactKeys(lesson, ['title']) || typeof lesson.title !== 'string' || !lesson.title.trim()) {
        problems.push(`lesson ${j + 1} of ${where} must have only a nonempty title`);
      }
    });
  });

  // The schema caps the tag COUNT at 5, and the model answered that pressure by
  // cramming fourteen comma-separated tags into the fifth string. Structure
  // satisfied, content not — so check the values, and a comma is the tell.
  if (!Array.isArray(course.tags) || course.tags.length > 5) {
    problems.push('tags must be a list of at most five strings');
  } else {
    course.tags.forEach((tag, i) => {
      const where = `tag ${i + 1}`;

      if (typeof tag !== 'string' || tag.trim() === '') {
        problems.push(`${where} is empty`);
        return;
      }

      if (tag.length > MAX_TAG_LENGTH) {
        problems.push(
          `${where} must be at most ${MAX_TAG_LENGTH} characters`
        );
      }

      if (tag.includes(',')) {
        problems.push(
          `${where} is a comma-separated list - each tag must name one topic on its own`
        );
      }
    });
  }

  // The model occasionally repeats a section under a slightly different name,
  // which is obvious to anyone scrolling the page.
  const seen = new Set();
  const duplicated = new Set();

  for (const module of course.modules) {
    if (typeof module?.title !== 'string') continue;

    const key = module.title.trim().toLowerCase();
    if (key === '') continue;

    if (seen.has(key)) duplicated.add(key);
    seen.add(key);
  }

  if (duplicated.size) {
    problems.push('each module must have a distinct title and cover a different part of the topic');
  }

  return problems;
}

const DECISION_REASONS = {
  ready: ['valid'],
  needs_clarification: ['ambiguous', 'unknown_subject'],
  rejected: ['meaningless', 'out_of_scope', 'unsafe'],
};

export function validateCourseDecision(decision) {
  if (!hasExactKeys(decision, courseDecisionSchema.required)) {
    return ['return exactly status, reasonCode, course, message, and suggestions'];
  }

  const { status, reasonCode, course, message, suggestions } = decision;
  if (typeof status !== 'string' || !Object.hasOwn(DECISION_REASONS, status) ||
      !DECISION_REASONS[status].includes(reasonCode)) {
    return ['use a recognized status and a matching reasonCode'];
  }
  if (typeof message !== 'string' || !Array.isArray(suggestions)) {
    return ['use a string message and a list of suggestions'];
  }
  if (status === 'ready') {
    if (message !== '' || suggestions.length || !course || typeof course !== 'object' || Array.isArray(course)) {
      return ['ready requires a course, an empty message and no suggestions'];
    }
    return validateCourse(course);
  }
  if (course !== null || !message.trim() || message.trim().length > 240) {
    return ['a non-ready decision requires a null course and a message of 1–240 characters'];
  }
  if (status === 'rejected' && suggestions.length) {
    return ['a rejected decision must have no suggestions'];
  }
  if (suggestions.length > 3 || suggestions.some((value) =>
    typeof value !== 'string' || !value.trim() || value.trim().length > 200)) {
    return ['return at most three standalone suggestions of 1–200 characters each'];
  }
  return [];
}

/**
 * Generate a validated course outline.
 *
 * @param {string} topic  already validated by the HTTP layer
 * @returns {Promise<object>} validated decision with attempt count and duration
 * @throws {ApiError} when both attempts fail
 */
export function createCourseGenerator({
  generate = generateJSON,
  tracker = generationTracker,
} = {}) {
  return async function generateCourse(topic, context = {}) {
    const startedAt = performance.now();

    // Appended to the conversation on the second attempt.
    let feedback;

    // Two, not three: each attempt is ~5s and a real API call, and a third mostly
    // adds latency to a request that is already failing.
    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const tracking = { ...context, operation: 'course', attemptNumber: attempt };
      let decision;
      try {
        const { text } = await generate({
          messages: courseMessages(topic, feedback),
          schema: courseDecisionSchema,
          schemaName: COURSE_DECISION_SCHEMA_NAME,
          tracking,
        });

        try {
          decision = JSON.parse(text);
        } catch {
          throw new ApiError(502, 'ai_unparseable', 'The model returned unreadable JSON. Try again.');
        }
      } catch (err) {
        const contentError = ['ai_unparseable', 'ai_truncated', 'ai_empty'].includes(err.code);
        if (contentError) {
          await tracker.validation(tracking, 'rejected', err.code);
        }
        traceError('course_generation_failed', { generationId: tracking.generationId, attempt, code: err.code });
        if (attempt === MAX_ATTEMPTS || (!contentError && err.code !== 'ai_unavailable')) throw err;
        feedback = contentError ? 'Return one complete JSON decision.' : undefined;
        continue;
      }

      const problems = validateCourseDecision(decision);
      if (problems.length) {
        const code = 'ai_invalid_course_decision';
        await tracker.validation(tracking, 'rejected', code);
        traceError('course_generation_failed', { generationId: tracking.generationId, attempt, code });
        if (attempt === MAX_ATTEMPTS) {
          throw new ApiError(502, code, 'The model could not return a valid course decision. Try again.');
        }
        feedback = problems.join('; ');
        continue;
      }

      await tracker.validation(tracking, 'accepted');
      const { status, reasonCode, message, suggestions } = decision;
      trace('course_decision', { generationId: tracking.generationId, attempt, status, reasonCode });
      return {
        ...decision,
        message: message.trim(),
        suggestions: suggestions.map((value) => value.trim()),
        attempts: attempt,
        ms: Math.round(performance.now() - startedAt),
      };
    }
  };
}

export const generateCourse = createCourseGenerator();
