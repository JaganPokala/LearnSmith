/**
 * Generates one lesson's content. Its own file because it shares nothing with
 * courseGenerator but the retry SHAPE — a new schema plus a new prompt is the
 * whole job, which is the payoff for generateJSON taking `schema` as an argument.
 */

import { generateJSON } from './openai.js';
import { lessonMessages } from './prompts.js';
import { lessonSchema, LESSON_SCHEMA_NAME, BLOCK_TYPES } from './schemas.js';
import { parseAIJson } from '../utils/parseAIJson.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { trace, traceError } from '../middlewares/trace.js';

// 1-3 rather than the milestone's 4-5: with explanations, 4-5 pushed lesson
// generation past 20s and dropped first-attempt success to 0/3.
const MCQ_MIN = 1;
const MCQ_MAX = 3;

// Strings that satisfy "non-empty" while naming no language. Two lessons came
// back with language: "none", which passes a blank check and means nothing to a
// highlighter.
const NON_LANGUAGES = new Set(['none', 'n/a', 'na', 'text', 'plain', 'plaintext', 'null', 'undefined', '-']);

/**
 * Check a parsed lesson against what the schema cannot express. Same contract as
 * validateCourse: prose strings naming positions, fed back to the model verbatim.
 *
 * @param {object} lesson
 * @returns {string[]} empty means valid
 */
export function validateLesson(lesson) {
  const problems = [];

  const filled = (value) => typeof value === 'string' && value.trim() !== '';

  if (!filled(lesson?.title)) {
    problems.push('the lesson title is empty');
  }

  // Return early: everything below assumes an array.
  if (!Array.isArray(lesson?.content)) {
    problems.push('content is missing or is not a list of blocks');
    return problems;
  }

  if (lesson.content.length === 0) {
    problems.push('the lesson has no content blocks at all');
  }

  lesson.content.forEach((block, i) => {
    const where = `block ${i + 1}`;

    // BLOCK_TYPES is imported, not retyped — a second copy drifts from the
    // renderer's the moment a type is added.
    if (!BLOCK_TYPES.includes(block?.type)) {
      problems.push(
        `${where} has type ${JSON.stringify(block?.type)} - it must be one of ${BLOCK_TYPES.join(', ')}`
      );
      return;
    }

    switch (block.type) {
      case 'heading':
      case 'paragraph': {
        if (!filled(block.text)) problems.push(`${where} (${block.type}) has no text`);
        break;
      }

      case 'code': {
        if (!filled(block.text)) problems.push(`${where} (code) has no code in it`);
        if (!filled(block.language)) {
          problems.push(`${where} (code) has no language - name the language so it can be highlighted`);
        } else if (NON_LANGUAGES.has(block.language.trim().toLowerCase())) {
          // If the block genuinely has no language it is not a code block.
          problems.push(
            `${where} (code) gives its language as ${JSON.stringify(block.language)}, which names no language - either name the real programming language or remove the code block`
          );
        }
        break;
      }

      case 'video': {
        if (!filled(block.query)) {
          problems.push(`${where} (video) has no search query`);
          break;
        }

        // Asked for a URL the model invents a plausible video id that 404s.
        if (/https?:|youtube\.com|youtu\.be/i.test(block.query)) {
          problems.push(
            `${where} (video) is a link (${JSON.stringify(block.query)}) - give the words you would type into the YouTube search box, never a URL`
          );
        }
        break;
      }

      case 'mcq': {
        if (!filled(block.question)) problems.push(`${where} (mcq) has no question`);
        if (!filled(block.explanation)) {
          problems.push(`${where} (mcq) has no explanation of why the answer is correct`);
        }

        if (!Array.isArray(block.options) || block.options.length < 2) {
          problems.push(`${where} (mcq) needs at least 2 options`);
          break;
        }

        const blank = block.options.filter((option) => !filled(option)).length;
        if (blank > 0) problems.push(`${where} (mcq) has ${blank} empty option(s)`);

        // A repeated option makes the question unanswerable and is invisible to
        // the schema.
        const normalised = block.options.map((option) => String(option).trim().toLowerCase());
        if (new Set(normalised).size !== normalised.length) {
          problems.push(`${where} (mcq) lists the same option twice - every option must be different`);
        }

        // THE CHECK THIS FILE EXISTS FOR. No JSON Schema can express "this
        // integer indexes that sibling array", so a schema-perfect mcq with four
        // options and answer: 7 marks the right answer wrong, with no error
        // anywhere. Number.isInteger too — 1.5 indexes nothing.
        if (
          !Number.isInteger(block.answer) ||
          block.answer < 0 ||
          block.answer >= block.options.length
        ) {
          problems.push(
            `${where} (mcq) has answer ${JSON.stringify(block.answer)} but ${block.options.length} options - answer must be the zero-based index of the correct option, so between 0 and ${block.options.length - 1}`
          );
        }
        break;
      }
    }
  });

  // Too few is the common failure: the model writes prose and runs out of budget.
  const mcqCount = lesson.content.filter((block) => block?.type === 'mcq').length;

  if (mcqCount < MCQ_MIN || mcqCount > MCQ_MAX) {
    problems.push(
      `the lesson has ${mcqCount} multiple-choice questions - it must end with between ${MCQ_MIN} and ${MCQ_MAX}`
    );
  }

  if (!Array.isArray(lesson.objectives) || lesson.objectives.length === 0) {
    problems.push('the lesson has no objectives');
  } else {
    lesson.objectives.forEach((objective, i) => {
      if (!filled(objective)) problems.push(`objective ${i + 1} is empty`);
    });
  }

  return problems;
}

/**
 * Generate validated content for one lesson. Mirrors generateCourse, with
 * 'ai_invalid_lesson' as the final code so a failure is traceable to which
 * generator produced it.
 *
 * @param {object} args
 * @param {string} args.courseTitle
 * @param {string} args.moduleTitle
 * @param {string} args.lessonTitle
 * @returns {Promise<{ lesson: object, attempts: number, ms: number }>}
 * @throws {ApiError}
 */
export async function generateLesson({ courseTitle, moduleTitle, lessonTitle }) {
  const startedAt = performance.now();

  let feedback;

  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { text } = await generateJSON({
        messages: lessonMessages({ courseTitle, moduleTitle, lessonTitle }, feedback),
        schema: lessonSchema,
        schemaName: LESSON_SCHEMA_NAME,
      });

      const lesson = parseAIJson(text, { lesson: lessonTitle, attempt });

      const problems = validateLesson(lesson);

      if (problems.length === 0) {
        const ms = Math.round(performance.now() - startedAt);

        // Block and mcq counts are what reveal lessons getting thinner as
        // prompts change.
        const mcqCount = lesson.content.filter((block) => block.type === 'mcq').length;

        trace(
          `  generator: "${lessonTitle}" ok on attempt ${attempt}, ${ms}ms, ${lesson.content.length} blocks, ${mcqCount} mcqs`
        );

        return { lesson, attempts: attempt, ms };
      }

      traceError(
        `  generator: "${lessonTitle}" attempt ${attempt} invalid - ${problems.length} violation(s): ${problems.join('; ')}`
      );

      if (attempt === MAX_ATTEMPTS) {
        throw new ApiError(
          502,
          'ai_invalid_lesson',
          `The model could not produce a valid lesson for "${lessonTitle}" in ${MAX_ATTEMPTS} attempts: ${problems.join('; ')}`
        );
      }

      feedback = problems.join('; ');
    } catch (err) {
      // Our own verdict, not a failure to classify. Let it out.
      if (err.code === 'ai_invalid_lesson') throw err;

      const upstream = err.code === 'ai_unavailable';

      traceError(
        `  generator: "${lessonTitle}" attempt ${attempt} failed (${upstream ? 'upstream' : 'content'}, ${err.code ?? 'no code'}): ${err.message}`
      );

      if (attempt === MAX_ATTEMPTS) throw err;

      // Feedback only for content failures.
      feedback = upstream
        ? undefined
        : `The previous attempt could not be read as a lesson: ${err.message}`;
    }
  }
}
