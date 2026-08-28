/**
 * server/utils/parseAIJson.js
 *
 * One pure function: model text in, object out, or a typed error.
 *
 * PURE ON PURPOSE — no async, no network, no database, no imports beyond
 * ApiError. That is what lets a hundred malformed strings be tested in
 * milliseconds. Testing the same cases through generateJSON would cost a real
 * API call each, take five seconds each, and — worse — most of these failures
 * cannot be produced on demand from a live model at all.
 *
 * WHY THIS EXISTS AT ALL, given D11 made the happy path parseable:
 *
 *   1. Truncation. finish_reason 'length' yields valid-LOOKING JSON that stops
 *      mid-object. generateJSON detects it, but the text still has to be
 *      handled, and the error must say "truncated" not "malformed".
 *   2. The json_object fallback (D11's recorded reversal condition) brings the
 *      markdown fences straight back.
 *   3. JSON.parse's own errors are useless in production. "Unexpected token '`'"
 *      names no topic, no length, and no context.
 */

import { ApiError } from '../middlewares/errorHandler.js';

/** How much of the offending text to keep in the error. Enough to diagnose. */
const PREVIEW_LENGTH = 300;

/**
 * Parse JSON out of a model response.
 *
 * @param {unknown} text     raw text from generateJSON — deliberately typed
 *                           `unknown`, because the whole point is that callers
 *                           may hand this anything
 * @param {object} [context] extra detail for the error message, e.g.
 *                           { topic: 'React Hooks', schemaName: 'course' }
 * @returns {object} the parsed object
 * @throws {ApiError} 502 'ai_unparseable' — never returns null on failure
 */
export function parseAIJson(text, context = {}) {
  // Context is folded into every message below, so a failure in the logs says
  // WHICH generation died, not just that one did.
  const where = Object.entries(context)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  const detail = where ? ` (${where})` : '';

  // 1. REJECT NON-STRINGS FIRST.
  //    JSON.parse(null) returns null instead of throwing — a genuine footgun.
  //    JSON.parse(42) returns 42. Neither is an object and neither is an error,
  //    so without this guard a null response becomes a silent `null` course.
  //    Check typeof !== 'string' and throw.

  if (typeof text !== 'string') {
    throw new ApiError(
      502,
      'ai_unparseable',
      `Expected model text, received ${text === null ? 'null' : typeof text}${detail}.`
    );
  }

  // Kept for the error messages: the ORIGINAL length and opening characters are
  // the evidence, and both are destroyed by the cleanup below.
  const preview = text.slice(0, PREVIEW_LENGTH);
  const originalLength = text.length;

  // 2. Trim. Task 3.0 measured leading "\n\n" on fenced responses.

  let candidate = text.trim();

  // 3. If the trimmed text is empty, throw — with a message that says EMPTY,
  //    not "invalid JSON". They have different causes: empty means the model
  //    returned nothing (see ai_empty), invalid means it returned the wrong
  //    thing. Do not merge them.

  if (candidate === '') {
    throw new ApiError(
      502,
      'ai_unparseable',
      `The model returned an empty string${detail} - empty, not malformed.`
    );
  }

  // 4. STRIP MARKDOWN FENCES if present.
  //    Opening fence may or may not carry a language tag:
  //        ```json\n{...}\n```      and      ```\n{...}\n```
  //    Strip a leading ``` plus optional word plus newline, and a trailing ```.

  candidate = candidate
    .replace(/^```[a-zA-Z]*\r?\n/, '')
    .replace(/```$/, '')
    .trim();

  // 5. SLICE TO THE OUTERMOST BRACES.
  //    Handles prose wrappers: `Here is your course: { ... } Hope this helps!`
  //    Use indexOf('{') and lastIndexOf('}') — first brace to last brace.
  //
  //    DO NOT use a regex like /\{.*\}/s. It looks equivalent and is not: the
  //    moment a string VALUE inside the JSON contains a brace —
  //        "text": "use {} for an empty dict"
  //    — a lazy regex ends the slice in the wrong place. First-to-last is
  //    dumber and correct for this job. Do not write a JSON tokenizer; you
  //    already have one and it is called JSON.parse.
  //
  //    If either brace is missing, throw — there is no object here at all.

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    // An opening brace with no closing one is not "no object", it is an object
    // that stops partway - the signature of a truncated response. Saying so
    // sends the reader to the token cap instead of to the parser.
    const unclosed = firstBrace !== -1 && lastBrace < firstBrace;

    throw new ApiError(
      502,
      'ai_unparseable',
      unclosed
        ? `The model response opens an object but never closes it${detail} - it looks truncated, not malformed. Length ${originalLength}. Starts: ${preview}`
        : `No JSON object in the model response${detail}. Length ${originalLength}. Starts: ${preview}`
    );
  }

  candidate = candidate.slice(firstBrace, lastBrace + 1);

  // 6. JSON.parse inside try/catch.

  let parsed;

  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    // 7. ON FAILURE, THROW — never return null.
    //    A parse failure and an empty result must not look the same to the
    //    caller; that is the silent-failure shape this whole project avoids.
    //
    //    Include in the message:
    //      - the parser's own error text (why it failed)
    //      - the ORIGINAL input length (a suspiciously round number like 4096 is
    //        the signature of truncation)
    //      - a PREVIEW_LENGTH-char preview of the text
    //      - anything in `context`
    //    When this fires in production the raw text is the only evidence of what
    //    happened, and it is gone forever if not captured here.

    throw new ApiError(
      502,
      'ai_unparseable',
      `Could not parse the model response${detail}: ${err.message}. Length ${originalLength}. Starts: ${preview}`
    );
  }

  // 8. Guard the result: JSON.parse('"a string"') and JSON.parse('123') both
  //    succeed and return non-objects. A course is an object. Throw if the
  //    result is not a non-null object.

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ApiError(
      502,
      'ai_unparseable',
      `The model response parsed to ${parsed === null ? 'null' : typeof parsed}, not an object${detail}. Length ${originalLength}. Starts: ${preview}`
    );
  }

  return parsed;
}
