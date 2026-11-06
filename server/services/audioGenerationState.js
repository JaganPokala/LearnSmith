import { randomUUID } from 'node:crypto';
import { LessonAudio } from '../models/LessonAudio.js';
import { AUDIO_LIMITS } from '../config/audioLimits.js';

export const findReadyAudio = (lessonId) =>
  LessonAudio.findOne({ lesson: lessonId, mp3: { $exists: true } });

export async function claimAudioGeneration(lessonId) {
  await LessonAudio.init();
  try {
    await LessonAudio.updateOne(
      { lesson: lessonId },
      { $setOnInsert: { lesson: lessonId } },
      { upsert: true, runValidators: true },
    );
  } catch (err) {
    if (!(err.code === 11000 && err.keyPattern?.lesson === 1)) throw err;
  }

  const now = new Date();
  const attemptId = randomUUID();
  const audio = await LessonAudio.findOneAndUpdate(
    {
      lesson: lessonId, mp3: { $exists: false },
      $or: [
        { generationStatus: { $ne: 'generating' } },
        { generationLeaseExpiresAt: { $lte: now } },
      ],
    },
    { $set: {
      generationStatus: 'generating', generationAttemptId: attemptId,
      generationLeaseExpiresAt: new Date(now.getTime() + AUDIO_LIMITS.leaseMs),
    } },
    { returnDocument: 'after', runValidators: true },
  );
  return audio ? { attemptId } : null;
}

const currentAttempt = (lessonId, attemptId) => ({
  lesson: lessonId, mp3: { $exists: false },
  generationStatus: 'generating', generationAttemptId: attemptId,
});

// Renew between paid stages. An expired owner cannot renew or start a new chunk.
export async function renewAudioGeneration({ lessonId, attemptId }) {
  const now = new Date();
  const result = await LessonAudio.updateOne(
    { ...currentAttempt(lessonId, attemptId), generationLeaseExpiresAt: { $gt: now } },
    { $set: { generationLeaseExpiresAt: new Date(now.getTime() + AUDIO_LIMITS.leaseMs) } },
  );
  return result.matchedCount === 1;
}

export async function completeAudioGeneration({ lessonId, attemptId, bytes, chars }) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > AUDIO_LIMITS.bytes) {
    throw new Error('Invalid narration bytes.');
  }
  return LessonAudio.findOneAndUpdate(
    { ...currentAttempt(lessonId, attemptId), generationLeaseExpiresAt: { $gt: new Date() } },
    {
      $set: { generationStatus: 'ready', mp3: bytes, chars },
      $unset: { generationAttemptId: '', generationLeaseExpiresAt: '' },
    },
    { returnDocument: 'after', runValidators: true },
  );
}

export async function failAudioGeneration({ lessonId, attemptId }) {
  return LessonAudio.updateOne(
    currentAttempt(lessonId, attemptId),
    {
      $set: { generationStatus: 'failed' },
      $unset: { generationAttemptId: '', generationLeaseExpiresAt: '' },
    },
  );
}
