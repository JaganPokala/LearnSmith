/**
 * server/services/openai.js
 *
 * The one place this server talks to OpenAI. Nothing else imports the SDK.
 *
 * Same rule as config/env.js and config/db.js: one owner. The API key is
 * constructed here and nowhere else, and when Phase 9 adds text-to-speech it
 * comes through this file too.
 */

import OpenAI from 'openai';
import { config } from '../config/env.js';
import { ApiError } from '../middlewares/errorHandler.js';

/**
 * Built once at module load and reused for every request.
 *
 * Three settings, all overriding SDK defaults that are wrong for us:
 *
 *   maxRetries: 0   The SDK retries TWICE by default, silently, with backoff
 *                   pauses in between. A call you time at 40s might really be
 *                   three attempts. Task 3.5 adds a retry we can see and log.
 *
 *   timeout         The default is 600_000 — ten minutes. Task 3.0 measured a
 *                   38s worst case for a real generation, so pick something
 *                   with room above that but far below ten minutes.
 *
 *   apiKey          From config, never process.env directly.
 */
const client = new OpenAI({
  apiKey: config.OPENAI_API_KEY,

  maxRetries: 0,

  // 60s: comfortably above the measured 38s worst case, and a twentieth of the
  // SDK's ten-minute default.
  timeout: 60_000,
});

/**
 * Ask the model for JSON matching an exact shape.
 *
 * Returns TEXT, not a parsed object. Parsing belongs to Task 3.4's
 * parseAIJson(), which stays a pure string -> object function that can be
 * tested against a hundred malformed inputs without making an API call. Keeping
 * them apart is what makes that possible.
 *
 * @param {object}  args
 * @param {Array<{role: string, content: string}>} args.messages
 *        the full conversation, built by services/prompts.js. Takes messages
 *        rather than a single prompt string because Task 3.5's retry works by
 *        APPENDING a correction message — the model needs to see its own failed
 *        attempt in context. A single-string parameter would have no place to
 *        put that, and accepting both would let retry feedback silently take
 *        the path that ignores it.
 * @param {object}  args.schema        JSON Schema describing the required shape
 * @param {string}  args.schemaName    short name for the schema, e.g. 'course'
 * @param {number} [args.maxTokens]    output cap; omit for the model default
 * @returns {Promise<{ text: string, ms: number, usage: object, finishReason: string }>}
 */
export async function generateJSON({ messages, schema, schemaName, maxTokens }) {
  // 1. Start a timer with performance.now(). Every call's latency gets logged —
  //    Task 3.0 showed 10.5s and 38.6s for the same prompt, so you want this
  //    number in the logs from day one rather than wondering later.

  const startedAt = performance.now();

  // 2. Call client.chat.completions.create with:
  //      model            : config.OPENAI_TEXT_MODEL
  //      messages         : the array from prompts.js (system + user, plus a
  //                         correction message on a Task 3.5 retry)
  //      max_completion_tokens : maxTokens, when provided
  //      response_format  : the structured-outputs block, shaped like
  //                         { type: 'json_schema',
  //                           json_schema: { name, strict: true, schema } }
  //
  //    This is the line that makes the model produce YOUR field names and no
  //    markdown fence. Task 3.0 proved a bare JSON.parse fails 2/2 without it.

  // 3. Wrap the call in try/catch. On an SDK error, throw an
  //    ApiError(502, 'ai_unavailable', ...).
  //    502 not 500: the failure is upstream, not in our code. Include
  //    err.status in the message so a 429 (rate limit) is distinguishable from
  //    a 401 (bad key) in the logs — those have completely different fixes.

  let res;

  try {
    res = await client.chat.completions.create({
      model: config.OPENAI_TEXT_MODEL,
      messages,

      // Spread so an omitted maxTokens sends no key at all, rather than
      // max_completion_tokens: undefined.
      ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),

      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
    });
  } catch (err) {
    throw new ApiError(
      502,
      'ai_unavailable',
      `OpenAI request failed after ${Math.round(performance.now() - startedAt)}ms (upstream status ${err.status ?? 'none'}): ${err.message}`
    );
  }

  const ms = Math.round(performance.now() - startedAt);

  // 4. Read the response:
  //      const choice = res.choices?.[0]
  //      finishReason = choice?.finish_reason
  //      text         = choice?.message?.content ?? null
  //
  //    THE TRUNCATION TRAP. finish_reason tells you how the model stopped:
  //      'stop'   -> it finished normally
  //      'length' -> it hit the token cap MID-JSON. The text is valid-looking
  //                  but incomplete, and JSON.parse will fail on it.
  //    If you do not check this, a truncated response is indistinguishable from
  //    a malformed one and you will spend the afternoon debugging your parser
  //    instead of raising the token limit.
  //    Throw ApiError(502, 'ai_truncated', ...) when it is 'length'.

  const choice = res.choices?.[0];
  const finishReason = choice?.finish_reason;
  const text = choice?.message?.content ?? null;

  if (finishReason === 'length') {
    throw new ApiError(
      502,
      'ai_truncated',
      `The model hit the token cap mid-JSON after ${ms}ms (max_completion_tokens: ${maxTokens ?? 'model default'}). The response is incomplete, not malformed - raise the cap.`
    );
  }

  // 5. A refusal returns no content at all — content can be null even with a
  //    200 response. Guard it: throw ApiError(502, 'ai_empty', ...) rather than
  //    returning null and letting the parser produce a confusing error later.

  if (!text) {
    throw new ApiError(
      502,
      'ai_empty',
      `The model returned no content after ${ms}ms (finish_reason: ${finishReason ?? 'unknown'}). A refusal looks like this.`
    );
  }

  // 6. Log one line: model, ms, prompt+completion tokens, finishReason.
  //    This is the only place that knows what a call cost. Without it, "why is
  //    generation slow" and "why is my bill growing" are both unanswerable.

  console.log(
    `  openai: ${config.OPENAI_TEXT_MODEL} ${ms}ms` +
      ` prompt=${res.usage?.prompt_tokens ?? '?'} completion=${res.usage?.completion_tokens ?? '?'}` +
      ` finish=${finishReason}`
  );

  // 7. Return { text, ms, usage, finishReason }.

  return { text, ms, usage: res.usage, finishReason };
}
