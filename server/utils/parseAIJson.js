/**
 * One pure function: model text in, object out, or a typed error. No async, no
 * network, no database — which is what lets a hundred malformed strings be
 * tested in milliseconds instead of a real API call each.
 */

import { ApiError } from '../middlewares/errorHandler.js';

/** How much of the offending text to keep in the error. Enough to diagnose. */
const PREVIEW_LENGTH = 300;

/**
 * Parse JSON out of a model response.
 *
 * @param {unknown} text     raw text — deliberately `unknown`, because the point
 *                           is that callers may hand this anything
 * @param {object} [context] extra detail for the error, e.g. { topic, attempt }
 * @returns {object} the parsed object
 * @throws {ApiError} 502 'ai_unparseable' — never returns null on failure
 */
export function parseAIJson(text, context = {}) {
  // Folded into every message below, so a failure in the logs says WHICH
  // generation died, not just that one did.
  const where = Object.entries(context)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  const detail = where ? ` (${where})` : '';

  // JSON.parse(null) returns null instead of throwing, and JSON.parse(42)
  // returns 42 — neither is an object and neither is an error, so without this
  // a null response becomes a silent null course.
  if (typeof text !== 'string') {
    throw new ApiError(
      502,
      'ai_unparseable',
      `Expected model text, received ${text === null ? 'null' : typeof text}${detail}.`
    );
  }

  // Kept for the error messages: the ORIGINAL length and opening characters are
  // the evidence, and the cleanup below destroys both.
  const preview = text.slice(0, PREVIEW_LENGTH);
  const originalLength = text.length;

  let candidate = text.trim();

  // "Empty" and "malformed" have different causes and must not merge.
  if (candidate === '') {
    throw new ApiError(
      502,
      'ai_unparseable',
      `The model returned an empty string${detail} - empty, not malformed.`
    );
  }

  // Markdown fences, with or without a language tag.
  candidate = candidate
    .replace(/^```[a-zA-Z]*\r?\n/, '')
    .replace(/```$/, '')
    .trim();

  // First brace to last brace, to survive prose wrappers. NOT a regex like
  // /\{.*\}/s — the moment a string VALUE contains a brace ("use {} for an
  // empty dict") a lazy regex ends the slice in the wrong place. Do not write a
  // JSON tokenizer; JSON.parse is one.
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    // An opening brace with no closing one is not "no object", it is an object
    // that stops partway — the signature of truncation. Saying so sends the
    // reader to the token cap instead of to the parser.
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

  let parsed;

  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    // Throw, never return null — a parse failure and an empty result must not
    // look the same to the caller. The raw text is the only evidence of what
    // happened and is gone forever if not captured here. A suspiciously round
    // length is the signature of truncation.
    throw new ApiError(
      502,
      'ai_unparseable',
      `Could not parse the model response${detail}: ${err.message}. Length ${originalLength}. Starts: ${preview}`
    );
  }

  // JSON.parse('"a string"') and JSON.parse('123') both succeed and return
  // non-objects.
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ApiError(
      502,
      'ai_unparseable',
      `The model response parsed to ${parsed === null ? 'null' : typeof parsed}, not an object${detail}. Length ${originalLength}. Starts: ${preview}`
    );
  }

  return parsed;
}
