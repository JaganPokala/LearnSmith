/**
 * JSON Schemas passed to OpenAI structured outputs — the machine contract;
 * prompts.js is the pedagogical one.
 *
 * Field names MUST match the mongoose models: left to itself the model invents
 * `courseTitle`/`lessonTitle`, none of which match `title`. Naming them here is
 * what lets a generated object go almost straight into Course.create().
 *
 * strict: true imposes two rules, both verified against the live API:
 * additionalProperties must be false, and `required` must list every key — so
 * THERE ARE NO OPTIONAL FIELDS. "Absent" is an empty string or empty array.
 */

/**
 * Build a strict-compliant object schema: every key required,
 * additionalProperties false. A helper because both rules are easy to forget on
 * a nested object, and the failure is a 400 naming a JSON path.
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
 * The shape of a generated course outline. Note what is NOT here: `creator`
 * (comes from the auth token) and `isEnriched` (a database flag, not content).
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

  // The milestone contract, enforced here as well as in the validator — array
  // lengths are the one constraint the API actually holds to. With minItems: 3
  // against a prompt demanding exactly one module, three runs returned 3, 3, 6.
  modules: {
    type: 'array',
    minItems: 3,
    maxItems: 6,
    items: strictObject({
      title: { type: 'string' },

      // Title only. Content is generated lazily on first open; ~20 lessons of
      // content in one response would hit the output cap as ai_truncated.
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

/**
 * One alternative in the content array, with `type` pinned to a literal. The
 * enum is what lets the model tell the five alternatives apart — without it
 * anyOf is five identical-looking shapes.
 *
 * @param {string} typeName  'heading' | 'paragraph' | 'code' | 'video' | 'mcq'
 * @param {Record<string, object>} fields  the fields specific to this block
 * @returns {object}
 */
function blockShape(typeName, fields) {
  return strictObject({
    type: { type: 'string', enum: [typeName] },
    ...fields,
  });
}

/**
 * Lesson content: five block types with different fields each. `anyOf` does
 * survive strict: true — verified — so each block carries only its own fields.
 */
export const lessonSchema = strictObject({
  title: { type: 'string' },

  // 3-5 is a readable bullet list; more reads as a wall and costs output tokens
  // the content array needs more.
  objectives: {
    type: 'array',
    minItems: 3,
    maxItems: 5,
    items: { type: 'string' },
  },

  content: {
    type: 'array',
    minItems: 5,

    // The truncation bound. ~297 completion tokens covered five blocks, and an
    // mcq with four options plus an explanation costs several times a paragraph.
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

        // A SEARCH QUERY, NEVER A URL — asked for a link the model invents a
        // plausible video id that 404s. Phase 9 resolves the query.
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
          // the sibling options array" — that check belongs to the validator,
          // and it is the one that stops a lesson marking the right answer wrong.
          answer: { type: 'integer' },

          explanation: { type: 'string' },
        }),
      ],
    },
  },
});

/** Passed to generateJSON as `schemaName`; appears in API error messages. */
export const LESSON_SCHEMA_NAME = 'lesson_content';

/** The block types LessonRenderer knows how to draw. */
export const BLOCK_TYPES = ['heading', 'paragraph', 'code', 'video', 'mcq'];
