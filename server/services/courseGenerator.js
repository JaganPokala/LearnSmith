/**
 * server/services/courseGenerator.js
 *
 * Ties Phase 3 together: generate -> parse -> validate -> retry once.
 *
 * This is the file where a silent catch would do the most damage. "The model
 * returned garbage", "the model returned an empty course" and "the network
 * dropped" must never collapse into one log line — they have three different
 * fixes. Every branch below logs distinctly, with the inputs to the decision.
 *
 * THE RETRY IS WIDER THAN ORIGINALLY PLANNED (see FAILURES.md W3).
 * It was scoped as "handle malformed JSON". But D12 turned off the SDK's own
 * retries to keep latency measurable, and 2 of ~12 calls in one session died as
 * transient timeouts. With maxRetries: 0 there is nothing else standing between
 * a network blip and a failed generation during the demo — so this retry must
 * cover upstream failure too, not only bad content.
 */

import { generateJSON } from './openai.js';
import { courseMessages } from './prompts.js';
import { courseSchema, COURSE_SCHEMA_NAME } from './schemas.js';
import { parseAIJson } from '../utils/parseAIJson.js';
import { ApiError } from '../middlewares/errorHandler.js';

/** Milestone contract. Also stated in the prompt (D15: fence vs brief). */
const MODULES_MIN = 3;
const MODULES_MAX = 6;
const LESSONS_MIN = 3;
const LESSONS_MAX = 5;

/** W4: a "tag" longer than this, or containing a comma, is not a tag. */
const MAX_TAG_LENGTH = 30;

/**
 * Check a parsed course against the things the schema cannot express.
 *
 * Returns an ARRAY OF STRINGS rather than throwing, for two reasons:
 *   - the caller decides whether a violation is worth a retry
 *   - the strings are fed back to the model verbatim as retry feedback, so they
 *     must read as instructions a model can act on ("module 2 has 7 lessons,
 *     the maximum is 5"), not as internal error codes
 *
 * @param {object} course  parsed output of parseAIJson
 * @returns {string[]}     empty means valid
 */
export function validateCourse(course) {
  // Collect ALL violations, never return on the first. One retry carrying three
  // corrections beats three round trips, and each round trip is ~5s.
  const problems = [];

  // 1. title — must be a non-empty string after trimming.
  //    Remember strict mode has no optional fields, so the key always EXISTS.
  //    An empty string is the realistic failure, not a missing key.

  if (typeof course?.title !== 'string' || course.title.trim() === '') {
    problems.push('the course title is empty - give the course a real title');
  }

  // 2. modules — must be an array, length within MODULES_MIN..MODULES_MAX.
  //    If it is not an array at all, push a violation and RETURN EARLY:
  //    everything below would throw on a non-array.

  if (!Array.isArray(course?.modules)) {
    problems.push('modules is missing or is not a list');
    return problems;
  }

  if (course.modules.length < MODULES_MIN || course.modules.length > MODULES_MAX) {
    problems.push(
      `the course has ${course.modules.length} modules - it must have between ${MODULES_MIN} and ${MODULES_MAX}`
    );
  }

  // 3. For each module (index i, so the message can name it):
  //      - title is a non-empty string
  //      - lessons is an array within LESSONS_MIN..LESSONS_MAX
  //      - every lesson has a non-empty title
  //    Name the position in every message: "module 3" is actionable,
  //    "a module" is not.

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

  // 4. tags — W4 guard. The schema caps the COUNT at 5, and the model responded
  //    to pressure by cramming fourteen comma-separated tags into the fifth
  //    string. Structure was satisfied; content was not. So check each tag:
  //      - non-empty after trimming
  //      - length <= MAX_TAG_LENGTH
  //      - contains no comma (the tell for a crammed list)

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

  // 5. Duplicate module titles are worth catching too — the model occasionally
  //    repeats a section under a slightly different name, and a duplicate is
  //    obvious to a judge scrolling the page.

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
 * Generate a validated course outline for a topic.
 *
 * @param {string} topic  already validated by the HTTP layer (D17) — this
 *                        function assumes a sane topic and does not re-check
 * @returns {Promise<{ course: object, attempts: number, ms: number }>}
 * @throws {ApiError} when both attempts fail
 */
export async function generateCourse(topic) {
  const startedAt = performance.now();

  // Feedback from a failed first attempt, appended to the conversation on the
  // second. Starts undefined.
  let feedback;

  // Why 2 and not 3: each attempt costs ~5s and a real API call. Two attempts
  // covers a transient blip and one bad generation. A third mostly adds latency
  // to a request that is already failing, and the user is watching a spinner.
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // 1. Build messages with courseMessages(topic, feedback) and call
    //    generateJSON with courseSchema / COURSE_SCHEMA_NAME.
    //
    //    Wrap ONLY the generate+parse+validate work in try/catch, and catch
    //    around the whole attempt — an upstream failure (W3) and a bad response
    //    both mean "this attempt failed", and both deserve attempt 2.

    try {
      const { text } = await generateJSON({
        messages: courseMessages(topic, feedback),
        schema: courseSchema,
        schemaName: COURSE_SCHEMA_NAME,
      });

      // 2. Parse with parseAIJson(text, { topic, attempt }). Passing context is
      //    what makes a production log line say WHICH generation died.

      const course = parseAIJson(text, { topic, attempt });

      // 3. Validate. If problems.length === 0, log success (attempt number,
      //    total ms, module count) and return { course, attempts, ms }.

      const problems = validateCourse(course);

      if (problems.length === 0) {
        const ms = Math.round(performance.now() - startedAt);

        console.log(
          `  generator: "${topic}" ok on attempt ${attempt}, ${ms}ms, ${course.modules.length} modules`
        );

        return { course, attempts: attempt, ms };
      }

      // 4. If there ARE problems and this was the LAST attempt, throw
      //    ApiError(502, 'ai_invalid_course', ...) listing them.
      //    If attempts remain: log the violations, set `feedback` to them joined
      //    into a sentence the model can act on, and continue the loop.
      //
      //    LOG THE VIOLATIONS EITHER WAY. This is the decision that can quietly
      //    return empty — if a retry silently fixes a recurring problem you will
      //    never learn the prompt has a systematic flaw.

      console.warn(
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
      // 5. In the catch: distinguish the two failure families in the log.
      //      err.code === 'ai_unavailable' -> upstream/network (W3)
      //      anything else                 -> bad content
      //    Both retry, but they mean different things and a log that merges them
      //    makes the W3 rate unmeasurable.
      //
      //    If this was the last attempt, rethrow. Otherwise set feedback only for
      //    CONTENT failures — feeding "the network timed out" back to the model
      //    as a correction is nonsense, and would waste prompt tokens telling it
      //    to fix something it did not do.

      // Our own verdict from step 4, not a failure to classify. Let it out.
      if (err.code === 'ai_invalid_course') throw err;

      const upstream = err.code === 'ai_unavailable';

      console.warn(
        `  generator: "${topic}" attempt ${attempt} failed (${upstream ? 'upstream' : 'content'}, ${err.code ?? 'no code'}): ${err.message}`
      );

      if (attempt === MAX_ATTEMPTS) throw err;

      feedback = upstream
        ? undefined
        : `The previous attempt could not be read as a course: ${err.message}`;
    }
  }
}
