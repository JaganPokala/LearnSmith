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
import { courseSchema, COURSE_SCHEMA_NAME } from './schemas.js';
import { parseAIJson } from '../utils/parseAIJson.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { trace, traceError } from '../middlewares/trace.js';

/** Milestone contract. Also stated in the prompt. */
const MODULES_MIN = 3;
const MODULES_MAX = 6;
const LESSONS_MIN = 3;
const LESSONS_MAX = 5;

/** A "tag" longer than this, or containing a comma, is not a tag. */
const MAX_TAG_LENGTH = 30;

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
      if (typeof lesson?.title !== 'string' || lesson.title.trim() === '') {
        problems.push(`lesson ${j + 1} of ${where} has an empty title`);
      }
    });
  });

  // The schema caps the tag COUNT at 5, and the model answered that pressure by
  // cramming fourteen comma-separated tags into the fifth string. Structure
  // satisfied, content not — so check the values, and a comma is the tell.
  if (Array.isArray(course.tags)) {
    course.tags.forEach((tag, i) => {
      const where = `tag ${i + 1}`;

      if (typeof tag !== 'string' || tag.trim() === '') {
        problems.push(`${where} is empty`);
        return;
      }

      if (tag.length > MAX_TAG_LENGTH) {
        problems.push(
          `${where} is ${tag.length} characters long ("${tag.slice(0, 40)}...") - a tag must be at most ${MAX_TAG_LENGTH}`
        );
      }

      if (tag.includes(',')) {
        problems.push(
          `${where} ("${tag}") is a comma-separated list - each tag must name one topic on its own`
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

    if (seen.has(key)) duplicated.add(module.title.trim());
    seen.add(key);
  }

  for (const title of duplicated) {
    problems.push(`two modules are both titled "${title}" - each module must cover a different part of the topic`);
  }

  return problems;
}

/**
 * Generate a validated course outline.
 *
 * @param {string} topic  already validated by the HTTP layer
 * @returns {Promise<{ course: object, attempts: number, ms: number }>}
 * @throws {ApiError} when both attempts fail
 */
export async function generateCourse(topic) {
  const startedAt = performance.now();

  // Appended to the conversation on the second attempt.
  let feedback;

  // Two, not three: each attempt is ~5s and a real API call, and a third mostly
  // adds latency to a request that is already failing.
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // The catch wraps the whole attempt: an upstream failure and a bad response
    // both mean "this attempt failed", and both deserve attempt 2.
    try {
      const { text } = await generateJSON({
        messages: courseMessages(topic, feedback),
        schema: courseSchema,
        schemaName: COURSE_SCHEMA_NAME,
      });

      // The context is what makes a production log line say WHICH generation died.
      const course = parseAIJson(text, { topic, attempt });

      const problems = validateCourse(course);

      if (problems.length === 0) {
        const ms = Math.round(performance.now() - startedAt);

        trace(
          `  generator: "${topic}" ok on attempt ${attempt}, ${ms}ms, ${course.modules.length} modules`
        );

        return { course, attempts: attempt, ms };
      }

      // Logged either way: if a retry silently fixes a recurring problem you
      // never learn the prompt has a systematic flaw.
      traceError(
        `  generator: "${topic}" attempt ${attempt} invalid - ${problems.length} violation(s): ${problems.join('; ')}`
      );

      if (attempt === MAX_ATTEMPTS) {
        throw new ApiError(
          502,
          'ai_invalid_course',
          `The model could not produce a valid course for "${topic}" in ${MAX_ATTEMPTS} attempts: ${problems.join('; ')}`
        );
      }

      feedback = problems.join('; ');
    } catch (err) {
      // Our own verdict from above, not a failure to classify. Let it out.
      if (err.code === 'ai_invalid_course') throw err;

      // Both retry, but a log that merges them makes the upstream-failure rate
      // unmeasurable.
      const upstream = err.code === 'ai_unavailable';

      traceError(
        `  generator: "${topic}" attempt ${attempt} failed (${upstream ? 'upstream' : 'content'}, ${err.code ?? 'no code'}): ${err.message}`
      );

      if (attempt === MAX_ATTEMPTS) throw err;

      // Feedback only for CONTENT failures — telling the model to fix a network
      // timeout is nonsense and wastes prompt tokens.
      feedback = upstream
        ? undefined
        : `The previous attempt could not be read as a course: ${err.message}`;
    }
  }
}
