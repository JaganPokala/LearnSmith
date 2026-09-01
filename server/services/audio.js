/**
 * Lesson prose -> Hinglish -> spoken mp3.
 *
 * Two model calls, in this order, because they cannot be one: the speech model
 * reads what it is given, it does not translate. Handing it English and asking
 * for a Hindi accent produces accented English, which is not what was asked for.
 */

import { generateText, synthesizeSpeech } from './openai.js';
import { narrationText, chunkForSpeech } from './narration.js';
import { trace } from '../middlewares/trace.js';
import { ApiError } from '../middlewares/errorHandler.js';

/** OpenAI's speech endpoint rejects input longer than this. */
const TTS_LIMIT = 4096;

/**
 * Latin script on purpose. Devanagari would be more "correct" Hindi, but
 * Hinglish as actually spoken is code-mixed and written in Roman letters, and
 * the speech model pronounces "rocket ka engine" far better than a
 * transliterated equivalent. Technical terms stay English because that is how
 * they are said out loud.
 */
const HINGLISH_SYSTEM = `You translate educational text into natural spoken Hinglish.

Rules:
- Write in ROMAN/Latin script only. Never Devanagari.
- Mix Hindi and English the way an Indian teacher actually speaks to a student.
- KEEP technical terms in English: rocket, engine, React, hooks, state, thrust,
  component, propulsion, function. Do not invent Hindi words for them.
- Keep every fact, number and name exactly as given. Do not add, remove or
  summarise anything.
- Output ONLY the translated text. No preamble, no notes, no quotation marks,
  no markdown.`;

/** How the narrator should sound. */
const VOICE_INSTRUCTIONS =
  'Speak as a warm, patient Indian teacher explaining to one student. ' +
  'Natural Indian English pronunciation. Measured pace, clear articulation, ' +
  'a short pause between paragraphs.';

/**
 * @param {string} english
 * @returns {Promise<string>}
 */
async function toHinglish(english) {
  const { text, ms } = await generateText({
    messages: [
      { role: 'system', content: HINGLISH_SYSTEM },
      { role: 'user', content: english },
    ],
    // Hinglish in Roman script runs longer than its English source - romanised
    // Hindi words are wordier. Too small a cap truncates mid-sentence, which
    // reads as a complete translation and is the reason generateText checks
    // finish_reason.
    maxTokens: 4000,
  });

  trace(`  audio: hinglish ${english.length} -> ${text.length} chars in ${ms}ms`);

  return text;
}

/**
 * Generate the narration audio for one lesson.
 *
 * @param {object} lesson  a Lesson document (or plain object)
 * @returns {Promise<{ bytes: Buffer, chars: number, ms: number }>}
 */
export async function generateLessonAudio(lesson) {
  const startedAt = performance.now();

  const english = narrationText(lesson);

  // A backstop, not the real check — the controller rejects unwritten lessons
  // on `isEnriched` before reaching here. This only catches a written lesson
  // whose blocks somehow contain no prose at all.
  if (english.length < 50) {
    throw new ApiError(
      400,
      'nothing_to_narrate',
      'This lesson has no prose to read out. Write the lesson first.'
    );
  }

  const hinglish = await toHinglish(english);

  // Chunking is a fallback, not the normal path: measured lessons run
  // 1096-2551 characters against a 4096 limit. It exists because the margin is
  // thin and translation makes text LONGER, so one long lesson would otherwise
  // fail at the API instead of here.
  const chunks = chunkForSpeech(hinglish, TTS_LIMIT);

  const parts = [];

  for (const chunk of chunks) {
    const { bytes } = await synthesizeSpeech({
      text: chunk,
      instructions: VOICE_INSTRUCTIONS,
    });

    parts.push(bytes);
  }

  // Concatenating mp3s works because each is a stream of self-describing
  // frames; players read them back to back. It is not re-encoding, so there is
  // a hairline seam at each join - inaudible at sentence boundaries, which is
  // where chunkForSpeech puts them.
  const bytes = Buffer.concat(parts);

  const ms = Math.round(performance.now() - startedAt);

  trace(
    `  audio: "${lesson.title}" ${chunks.length} chunk(s), ${hinglish.length} chars -> ${Math.round(bytes.length / 1024)}KB in ${ms}ms`
  );

  return { bytes, chars: hinglish.length, ms };
}
