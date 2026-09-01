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

/**
 * Ask the model for plain text. No schema, no JSON — used for translation,
 * where the output is prose and a structured wrapper would only be something to
 * unwrap again.
 *
 * @param {object} args
 * @param {Array<{role: string, content: string}>} args.messages
 * @param {number} [args.maxTokens]
 * @returns {Promise<{ text: string, ms: number }>}
 */
export async function generateText({ messages, maxTokens }) {
  const startedAt = performance.now();

  let res;

  try {
    res = await client.chat.completions.create({
      model: config.OPENAI_TEXT_MODEL,
      messages,
      ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
    });
  } catch (err) {
    throw new ApiError(
      502,
      'ai_unavailable',
      `OpenAI text request failed after ${Math.round(performance.now() - startedAt)}ms (upstream status ${err.status ?? 'none'}): ${err.message}`
    );
  }

  const ms = Math.round(performance.now() - startedAt);
  const choice = res.choices?.[0];

  // Same truncation trap as generateJSON: 'length' means it hit the cap
  // mid-sentence, and half a translation reads as a complete one.
  if (choice?.finish_reason === 'length') {
    throw new ApiError(
      502,
      'ai_truncated',
      `The model hit the token cap mid-text after ${ms}ms (max_completion_tokens: ${maxTokens ?? 'model default'}).`
    );
  }

  const text = choice?.message?.content ?? '';

  if (!text.trim()) {
    throw new ApiError(502, 'ai_empty', `The model returned no text after ${ms}ms.`);
  }

  trace(
    `  openai: ${config.OPENAI_TEXT_MODEL} text ${ms}ms` +
      ` prompt=${res.usage?.prompt_tokens ?? '?'} completion=${res.usage?.completion_tokens ?? '?'}`
  );

  return { text: text.trim(), ms };
}

/**
 * Text to speech. Returns raw BYTES, not a URL — the caller decides where they
 * live.
 *
 * A longer timeout than the text calls: synthesis time scales with the length
 * of the input, and three minutes of audio is not a 30-second request.
 *
 * @param {object} args
 * @param {string} args.text          what to say (API caps this at 4096 chars)
 * @param {string} [args.voice]
 * @param {string} [args.instructions]  how to say it - accent, pace, tone
 * @returns {Promise<{ bytes: Buffer, ms: number }>}
 */
export async function synthesizeSpeech({ text, voice = 'alloy', instructions }) {
  const startedAt = performance.now();

  let res;

  try {
    res = await client.audio.speech.create(
      {
        model: config.OPENAI_TTS_MODEL,
        voice,
        input: text,
        // mp3 rather than the default-by-accident: it is the one format every
        // browser plays from a blob without a codec negotiation.
        response_format: 'mp3',
        ...(instructions ? { instructions } : {}),
      },
      { timeout: 90_000 }
    );
  } catch (err) {
    throw new ApiError(
      502,
      'tts_unavailable',
      `OpenAI speech request failed after ${Math.round(performance.now() - startedAt)}ms (upstream status ${err.status ?? 'none'}): ${err.message}`
    );
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  const ms = Math.round(performance.now() - startedAt);

  trace(
    `  openai: ${config.OPENAI_TTS_MODEL} speech ${ms}ms, ${text.length} chars -> ${Math.round(bytes.length / 1024)}KB`
  );

  return { bytes, ms };
}
