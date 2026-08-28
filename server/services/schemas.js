/**
 * server/services/schemas.js
 *
 * JSON Schemas passed to OpenAI structured outputs. These are the machine
 * contract; services/prompts.js is the pedagogical one. Neither should do the
 * other's job.
 *
 * THE FIELD NAMES HERE MUST MATCH THE MONGOOSE MODELS.
 * That is the whole point of D11 — Task 3.0 showed the model inventing
 * `courseTitle` / `moduleTitle` / `lessonTitle` on its own, none of which match
 * `title` in models/Course.js. Naming them here means the generated object can
 * go almost straight into Course.create() with no translation layer to drift.
 *
 * TWO RULES `strict: true` IMPOSES ON US (both verified against the live API,
 * rejected upstream in ~400ms before reaching the model):
 *
 *   'additionalProperties' is required to be supplied and to be false
 *   'required' is required to be an array including every key in properties 
 * The second one has a consequence worth stating plainly: THERE ARE NO
 * OPTIONAL FIELDS. Every property is required. "Absent" has to be expressed as
 * an empty string or an empty array, never a missing key.
 *
 * Array lengths DO hold. With minItems: 3 and a prompt actively demanding
 * "EXACTLY ONE module. One. Just 1 module.", three runs returned 3, 3 and 6 —
 * never below the minimum. So minItems/maxItems are worth setting here rather
 * than leaving entirely to the Task 3.5 validator.
 */

/**
 * Build a strict-compliant object schema.
 *
 * Every key in `properties` is automatically added to `required`, and
 * `additionalProperties: false` is set. Written as a helper because both rules
 * are easy to forget on a nested object, and the failure is a 400 naming a JSON
 * path rather than anything that points at the line you got wrong.
 *
 * @param {Record<string, object>} properties
 * @returns {object} a schema object safe to nest anywhere
 */
export function strictObject(properties) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/**
 * The shape of a generated course outline.
 *
 * Note what is NOT here: `creator` (comes from the auth token, never the model)
 * and `isEnriched` (a database flag, not content). Only ask the model for what
 * the model should decide.
 *
 * Build it with strictObject() so the two strict rules cannot be forgotten.
 *
 * Fields, matching models/Course.js exactly:
 *
 *   1. title       — string. The course name.
 *
 *   2. description — string. Two or three sentences for a learner deciding
 *                    whether to take it. Required like everything else, so an
 *                    empty string is the "none" case, never a missing key.
 *
 *   3. tags        — array of strings. Topic chips for the UI.
 *                    Consider a maxItems here: the model will happily produce
 *                    twelve, and five is a row of chips.
 *
 *   4. modules     — array, minItems 3, maxItems 6 (the Milestone contract).
 *                    Each item is a strictObject with:
 *                      title   — string, naming a coherent chunk of learning
 *                      lessons — array, minItems 3, maxItems 5, each a
 *                                strictObject with a `title` string
 *
 * Lessons carry ONLY a title at this stage. Their content is generated lazily
 * on first open (Task 4.3) — asking for it now would mean ~20 lessons of
 * content in one response, which at the measured token rate would blow past
 * the model's output cap and produce `ai_truncated`. This is why the outline
 * and the content are two different schemas.
 */
export const courseSchema = strictObject({
  title: { type: 'string' },

  // Required like everything else under strict, so "no description" has to be
  // an empty string, never a missing key.
  description: { type: 'string' },

  // Capped: the model will happily produce twelve, and five is a row of chips.
  tags: {
    type: 'array',
    items: { type: 'string' },
    maxItems: 5,
  },

  // The Milestone contract, enforced here rather than only in Task 3.5's
  // validator - array lengths are the one constraint the API actually holds to.
  modules: {
    type: 'array',
    minItems: 3,
    maxItems: 6,
    items: strictObject({
      title: { type: 'string' },

      // Title only. Content is generated lazily on first open (Task 4.3);
      // ~20 lessons of content in one response would hit the output cap and
      // come back as ai_truncated.
      lessons: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: strictObject({
          title: { type: 'string' },
        }),
      },
    }),
  },
});

/** Passed to generateJSON as `schemaName`; appears in API error messages. */
export const COURSE_SCHEMA_NAME = 'course_outline';

// ---------------------------------------------------------------------------
// LESSON CONTENT (Task 3.6)
// ---------------------------------------------------------------------------
//
// The course schema was uniform — every module looks like every other module.
// Lesson content is not: five block types with different fields each.
//
// `anyOf` DOES survive strict: true — verified against the live API. Each block
// comes back carrying only its own fields (a `code` block has `language`, an
// `mcq` does not). So there is no need for the flat "every field present, unused
// ones empty" fallback that D11's no-optional-fields rule would otherwise force.
//
// Note the `enum` on each `type`: that is what lets the model — and any reader —
// tell the alternatives apart. Without it, `anyOf` is five identical-looking
// shapes and nothing pins a block to its own field set.

/**
 * One alternative in the content array. A thin wrapper over strictObject that
 * pins `type` to a single literal.
 *
 * @param {string} typeName  'heading' | 'paragraph' | 'code' | 'video' | 'mcq'
 * @param {Record<string, object>} fields  the fields specific to this block
 * @returns {object}
 */
function blockShape(typeName, fields) {
  // 1. Call strictObject with `type` pinned via { type: 'string', enum: [typeName] }
  //    plus the rest of `fields`.

  return strictObject({
    type: { type: 'string', enum: [typeName] },
    ...fields,
  });
}

/**
 * The lesson schema.
 *
 * Fields, matching models/Lesson.js:
 *
 *   1. title      — string.
 *
 *   2. objectives — array of strings. Milestone 8 asks for these explicitly;
 *                   they render as a bullet list above the content.
 *                   Cap it (3-5 is a readable list).
 *
 *   3. content    — array with `items: { anyOf: [...] }`, one blockShape per
 *                   type:
 *
 *       heading    text
 *       paragraph  text
 *       code       language, text
 *       video      query          <- A SEARCH QUERY, NEVER A URL.
 *                                    A model asked for a YouTube link will
 *                                    confidently invent one that 404s — it has
 *                                    seen a million video ids and there is no
 *                                    "I don't know" in this pipeline (D17).
 *                                    Phase 9 resolves the query to a real video.
 *       mcq        question, options, answer, explanation
 *
 * SET maxItems ON `content`. This is where truncation stops being theoretical:
 * a lesson with paragraphs, code and 4-5 MCQs with explanations is far more
 * output than the ~350 tokens a course outline costs. The probe produced 297
 * completion tokens for FIVE blocks; a 20-block lesson is a different order of
 * magnitude. Bound it here rather than diagnosing `ai_truncated` under demo
 * pressure.
 *
 * On the mcq shape:
 *   - `options`: minItems 2, maxItems 4
 *   - `answer` : { type: 'integer' } — the schema can say "an integer". It
 *                CANNOT say "a valid index into the sibling options array".
 *                That check is the validator's, and it is the single most
 *                important one in this file: a schema-perfect mcq with
 *                answer: 7 and four options is a lesson where the right answer
 *                is marked wrong.
 *   - `explanation`: Milestone 8 asks for an explanation of the correct answer.
 */
export const lessonSchema = strictObject({
  title: { type: 'string' },

  // 3-5 is a readable bullet list; more reads as a wall and costs output tokens
  // that the content array needs more.
  objectives: {
    type: 'array',
    minItems: 3,
    maxItems: 5,
    items: { type: 'string' },
  },

  content: {
    type: 'array',
    minItems: 5,

    // The truncation bound. The probe measured ~297 completion tokens for five
    // blocks, and an mcq with four options plus an explanation costs several
    // times a paragraph. 12 leaves room for a full lesson well inside the cap.
    maxItems: 20,

    items: {
      anyOf: [
        blockShape('heading', {
          text: { type: 'string' },
        }),

        blockShape('paragraph', {
          text: { type: 'string' },
        }),

        blockShape('code', {
          language: { type: 'string' },
          text: { type: 'string' },
        }),

        // A SEARCH QUERY, NEVER A URL - Phase 9 resolves it to a real video.
        blockShape('video', {
          query: { type: 'string' },
        }),

        blockShape('mcq', {
          question: { type: 'string' },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: { type: 'string' },
          },

          // The schema can say "an integer". It cannot say "a valid index into
          // the sibling options array" - that check belongs to the validator.
          answer: { type: 'integer' },

          explanation: { type: 'string' },
        }),
      ],
    },
  },
});

/** Passed to generateJSON as `schemaName`; appears in API error messages. */
export const LESSON_SCHEMA_NAME = 'lesson_content';

/** The block types LessonRenderer (Phase 7) knows how to draw. */
export const BLOCK_TYPES = ['heading', 'paragraph', 'code', 'video', 'mcq'];
