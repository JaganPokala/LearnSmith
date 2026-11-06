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
import { AUDIO_LIMITS } from '../config/audioLimits.js';
import { generationTracker } from './generationTracking.js';

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
 * @param {object} lesson
 * @returns {Promise<string>}
 */
export function prepareNarration(lesson) {
  const english = narrationText(lesson);
  if (english.length < 50) {
    throw new ApiError(
      400,
      'nothing_to_narrate',
      'This lesson has no prose to read out. Write the lesson first.'
    );
  }
  if (english.length > AUDIO_LIMITS.sourceChars) {
    throw new ApiError(400, 'audio_too_long', 'This lesson is too long for narration.');
  }
  return english;
}

export function createLessonAudioGenerator({
  translate = generateText,
  speak = synthesizeSpeech,
  tracker = generationTracker,
} = {}) {
  return async function generateLessonAudio(lesson, context = {}) {
    const startedAt = performance.now();
    const english = prepareNarration(lesson);
    const { beforeProviderCall, ...identity } = context;
    if (typeof beforeProviderCall !== 'function') {
      throw new ApiError(503, 'tracking_context_invalid', 'An audio claim is required.');
    }
    const tracking = { ...identity, operation: 'audio_translation', attemptNumber: 1 };
    await beforeProviderCall();
    const { text: hinglish } = await translate({
      messages: [
        { role: 'system', content: HINGLISH_SYSTEM },
        { role: 'user', content: english },
      ],
      maxTokens: 4000,
      tracking,
    });

    const chunks = chunkForSpeech(hinglish, AUDIO_LIMITS.chunkChars);
    if (!chunks.length || hinglish.length > AUDIO_LIMITS.translatedChars || chunks.length > AUDIO_LIMITS.chunks) {
      await tracker.validation(tracking, 'rejected', 'audio_too_long');
      throw new ApiError(502, 'audio_too_long', 'The translated narration exceeds the audio size limit.');
    }
    await tracker.validation(tracking, 'accepted');

    const parts = [];
    let totalBytes = 0;

    for (const [index, chunk] of chunks.entries()) {
      await beforeProviderCall();
      const { bytes } = await speak({
        text: chunk,
        instructions: VOICE_INSTRUCTIONS,
        tracking: { ...identity, operation: 'audio_speech', attemptNumber: index + 2 },
      });
      totalBytes += bytes.length;
      if (!bytes.length || totalBytes > AUDIO_LIMITS.bytes) {
        throw new ApiError(502, 'audio_invalid', 'The generated narration exceeds the storage limit.');
      }
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
  };
}

export const generateLessonAudio = createLessonAudioGenerator();
