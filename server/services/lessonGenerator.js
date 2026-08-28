/**
 * server/services/lessonGenerator.js
 *
 * Generates one lesson's content. Its own file rather than more of
 * courseGenerator.js, because the two share nothing but the retry SHAPE — and
 * that shape is already provided by generateJSON / parseAIJson / the loop.
 *
 * Note how little machinery this needs: generateJSON takes `schema` as a
 * parameter, so a new schema plus a new prompt is the whole job. That is the
 * payoff for not hardcoding the course shape into the client in Task 3.1.
 */

import { generateJSON } from './openai.js';
import { lessonMessages } from './prompts.js';
import { lessonSchema, LESSON_SCHEMA_NAME, BLOCK_TYPES } from './schemas.js';
import { parseAIJson } from '../utils/parseAIJson.js';
import { ApiError } from '../middlewares/errorHandler.js';

const MCQ_MIN = 1;
const MCQ_MAX = 3;

/**
 * Languages that satisfy "non-empty string" while naming no language at all.
 *
 * Found in verification: two lessons came back with `language: "none"`, which
 * passes a blank check, means nothing to a syntax highlighter, and in one case
 * sat on a code block that should not have existed. The schema requires the
 * field to be present; only this can require it to be useful.
 */
const NON_LANGUAGES = new Set(['none', 'n/a', 'na', 'text', 'plain', 'plaintext', 'null', 'undefined', '-']);

/**
 * Check a parsed lesson against what the schema cannot express.
 *
 * Same contract as validateCourse (D18): prose strings, naming positions,
 * because they are fed back to the model verbatim on retry.
 *
 * @param {object} lesson
 * @returns {string[]} empty means valid
 */
export function validateLesson(lesson) {
  const problems = [];

  /** Every check below is "present and not blank", so it is worth a name. */
  const filled = (value) => typeof value === 'string' && value.trim() !== '';

  // 1. title — non-empty string.

  if (!filled(lesson?.title)) {
    problems.push('the lesson title is empty');
  }

  // 2. content — must be an array with at least one block. Push and RETURN
  //    EARLY if it is not an array; everything below assumes it is.

  if (!Array.isArray(lesson?.content)) {
    problems.push('content is missing or is not a list of blocks');
    return problems;
  }

  if (lesson.content.length === 0) {
    problems.push('the lesson has no content blocks at all');
  }

  // 3. Every block must have a `type` in BLOCK_TYPES.
  //    Import the list rather than writing the five names again — a hardcoded
  //    second copy drifts from the renderer's the moment a type is added.

  // 4. Per-type checks the schema cannot make. Name the block position in every
  //    message ("block 4"), same reasoning as D18.
  //
  //    heading / paragraph : `text` non-empty after trimming.
  //
  //    code   : `text` non-empty AND `language` non-empty. A code block with no
  //             language breaks syntax highlighting in Phase 7, and the schema
  //             only requires the field to exist — "" satisfies it.
  //
  //    video  : `query` non-empty, and MUST NOT look like a URL. Reject
  //             anything containing "http" or "youtube.com" or "youtu.be".
  //             The model will confidently invent a plausible video id that
  //             404s; there is no "I don't know" in this pipeline (D17), and
  //             Phase 9 is what turns a query into a real link.
  //
  //    mcq    : the important one.
  //             - `question` non-empty
  //             - `options` an array of at least 2 non-empty strings
  //             - no duplicate options (a repeated option makes the question
  //               unanswerable and is invisible in the schema)
  //             - `explanation` non-empty (Milestone 8 asks for it)
  //             - *** `answer` MUST BE AN INTEGER IN [0, options.length) ***
  //               THIS IS THE CHECK THIS FILE EXISTS FOR. No JSON Schema can
  //               express "this integer indexes that sibling array". A
  //               schema-perfect mcq with four options and answer: 7 renders a
  //               question where clicking the right answer is marked wrong,
  //               with no error anywhere. Check Number.isInteger too — 1.5
  //               satisfies "integer" in some producers and indexes nothing.

  lesson.content.forEach((block, i) => {
    const where = `block ${i + 1}`;

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
          // "none" is not a language. If the block genuinely has no language,
          // it is not a code block and should not be here at all.
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

        const normalised = block.options.map((option) => String(option).trim().toLowerCase());
        if (new Set(normalised).size !== normalised.length) {
          problems.push(`${where} (mcq) lists the same option twice - every option must be different`);
        }

        // The check this file exists for.
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

  // 5. Count the mcq blocks. NOTE: Milestone 8 asks for 4-5; we use 1-3
  //    deliberately (see DECISIONS.md) - 4-5 MCQs with explanations pushed
  //    lesson generation past 20s. Too few is the
  //    common failure; the model tends to write prose and run out of budget.

  const mcqCount = lesson.content.filter((block) => block?.type === 'mcq').length;

  if (mcqCount < MCQ_MIN || mcqCount > MCQ_MAX) {
    problems.push(
      `the lesson has ${mcqCount} multiple-choice questions - it must end with between ${MCQ_MIN} and ${MCQ_MAX}`
    );
  }

  // 6. Objectives — array of non-empty strings. Not fatal if short, but an
  //    empty objectives list renders as an empty bullet list in Phase 7.

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
 * Generate validated content for one lesson.
 *
 * @param {object} args
 * @param {string} args.courseTitle
 * @param {string} args.moduleTitle
 * @param {string} args.lessonTitle
 * @returns {Promise<{ lesson: object, attempts: number, ms: number }>}
 * @throws {ApiError}
 */
export async function generateLesson({ courseTitle, moduleTitle, lessonTitle }) {
  // Mirror generateCourse exactly — same two attempts, same split between
  // upstream and content failures, same rule that feedback is set only for
  // content failures (D19), same exemption so the loop's own verdict is not
  // caught and relabelled by its own catch (D20).
  //
  // Differences worth noting while writing it:
  //   - the error code on final failure is 'ai_invalid_lesson', not
  //     'ai_invalid_course'. Distinct codes mean a failing route in Phase 4 is
  //     traceable to which generator produced it.
  //   - parseAIJson context should carry the lesson title, not the topic:
  //     "which generation died" is the whole point of passing context.
  //   - log the block count and mcq count on success. Those two numbers are
  //     what tell you later whether lessons are getting thinner as prompts
  //     change.

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
        const mcqCount = lesson.content.filter((block) => block.type === 'mcq').length;

        console.log(
          `  generator: "${lessonTitle}" ok on attempt ${attempt}, ${ms}ms, ${lesson.content.length} blocks, ${mcqCount} mcqs`
        );

        return { lesson, attempts: attempt, ms };
      }

      console.warn(
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

      console.warn(
        `  generator: "${lessonTitle}" attempt ${attempt} failed (${upstream ? 'upstream' : 'content'}, ${err.code ?? 'no code'}): ${err.message}`
      );

      if (attempt === MAX_ATTEMPTS) throw err;

      feedback = upstream
        ? undefined
        : `The previous attempt could not be read as a lesson: ${err.message}`;
    }
  }
}
