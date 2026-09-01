/**
 * The one place this server talks to OpenAI. Nothing else imports the SDK, so
 * the API key is constructed here and nowhere else.
 */

import OpenAI from 'openai';
import { config } from '../config/env.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { trace } from '../middlewares/trace.js';

// Built once at module load. maxRetries: 0 because the SDK otherwise retries
// twice, silently, with backoff — a call you time at 40s might be three
// attempts.
//
// 30s, not the 60s this used to be. That number was chosen against a 38.6s
// measurement taken before the prompt changes; nothing has come near it since
// (6-13s across every run). It matters because MAX_ATTEMPTS is 2, so the
// timeout doubles into the server's worst case: 60s meant a 120s request the
// client would have to out-wait, and the client's own timeout (Task 7.3) has to
// exceed the server's or it cancels work that was about to succeed. 30s halves
// that to ~60s while keeping 2x headroom over anything observed.
const client = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 30_000,
});

/**
 * Ask the model for JSON matching an exact shape. Returns TEXT, not a parsed
 * object — parsing stays a pure string -> object function that can be tested
 * against malformed input without making an API call.
 *
 * @param {object}  args
 * @param {Array<{role: string, content: string}>} args.messages
 *        the full conversation. Messages rather than one prompt string because
 *        the retry works by APPENDING a correction — the model needs to see its
 *        own failed attempt in context.
 * @param {object}  args.schema        JSON Schema describing the required shape
 * @param {string}  args.schemaName    short name for the schema, e.g. 'course'
 * @param {number} [args.maxTokens]    output cap; omit for the model default
 * @returns {Promise<{ text: string, ms: number, usage: object, finishReason: string }>}
 */
export async function generateJSON({ messages, schema, schemaName, maxTokens }) {
  const startedAt = performance.now();

  let res;

  try {
    res = await client.chat.completions.create({
      model: config.OPENAI_TEXT_MODEL,
      messages,

      // Spread so an omitted maxTokens sends no key at all.
      ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),

      // Structured outputs: this is what makes the model produce OUR field
      // names and no markdown fence. A bare JSON.parse failed 2/2 without it.
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
    // 502 not 500 — the failure is upstream. err.status distinguishes a 429
    // (rate limit) from a 401 (bad key); those have different fixes.
    throw new ApiError(
      502,
      'ai_unavailable',
      `OpenAI request failed after ${Math.round(performance.now() - startedAt)}ms (upstream status ${err.status ?? 'none'}): ${err.message}`
    );
  }

  const ms = Math.round(performance.now() - startedAt);

  const choice = res.choices?.[0];
  const finishReason = choice?.finish_reason;
  const text = choice?.message?.content ?? null;

  // THE TRUNCATION TRAP: 'length' means it hit the token cap MID-JSON. The text
  // looks valid but is incomplete, so without this check a truncated response
  // is indistinguishable from a malformed one and you debug the parser instead
  // of raising the cap.
  if (finishReason === 'length') {
    throw new ApiError(
      502,
      'ai_truncated',
      `The model hit the token cap mid-JSON after ${ms}ms (max_completion_tokens: ${maxTokens ?? 'model default'}). The response is incomplete, not malformed - raise the cap.`
    );
  }

  // A refusal returns 200 with null content.
  if (!text) {
    throw new ApiError(
      502,
      'ai_empty',
      `The model returned no content after ${ms}ms (finish_reason: ${finishReason ?? 'unknown'}). A refusal looks like this.`
    );
  }

  // The only place that knows what a call cost. Without it, "why is generation
  // slow" and "why is my bill growing" are both unanswerable.
  trace(
    `  openai: ${config.OPENAI_TEXT_MODEL} ${ms}ms` +
      ` prompt=${res.usage?.prompt_tokens ?? '?'} completion=${res.usage?.completion_tokens ?? '?'}` +
      ` finish=${finishReason}`
  );

  return { text, ms, usage: res.usage, finishReason };
}
