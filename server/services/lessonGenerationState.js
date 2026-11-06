import { randomUUID } from 'node:crypto';
import Lesson from '../models/Lesson.js';
import { LESSON_GENERATION_LIMITS } from '../config/lessonGenerationLimits.js';

// Report the claim's current state using the server clock. A leftover
// "generating" flag is not evidence that an expired worker is still active.
export function describeLessonGeneration(lesson, now = new Date()) {
  if (lesson.isEnriched) return { state: 'ready', retryAt: null };
  if (lesson.generationStatus === 'generating') {
    const expires = lesson.generationLeaseExpiresAt
      ? new Date(lesson.generationLeaseExpiresAt) : null;
    if (expires && expires.getTime() > now.getTime()) {
      return { state: 'generating', retryAt: expires.toISOString() };
    }
    return { state: 'retryable', retryAt: null };
  }
  return { state: lesson.generationStatus === 'failed' ? 'failed' : 'pending', retryAt: null };
}

export async function claimLessonGeneration(lessonId, courseId) {
  const now = new Date();
  const attemptId = randomUUID();

  const lesson = await Lesson.findOneAndUpdate(
    {
      _id: lessonId,
      course: courseId,
      isEnriched: false,

      $or: [
        // Includes older documents without generationStatus.
        { generationStatus: { $ne: 'generating' } },

        // A previous attempt stopped making progress.
        { generationLeaseExpiresAt: { $lte: now } },
        // Recover legacy/incomplete claims that have no expiry at all.
        { generationLeaseExpiresAt: null },
      ],
    },
    {
      $set: {
        generationStatus: 'generating',
        generationAttemptId: attemptId,
        generationLeaseExpiresAt: new Date(now.getTime() + LESSON_GENERATION_LIMITS.leaseMs),
      },
    },
    {
      returnDocument: 'after',
      runValidators: true,
    },
  );

  return lesson ? { lesson, attemptId } : null;
}

export async function renewLessonGeneration({ lessonId, courseId, attemptId, now = new Date() }) {
  const result = await Lesson.updateOne(
    {
      _id: lessonId, course: courseId, isEnriched: false,
      generationStatus: 'generating', generationAttemptId: attemptId,
      generationLeaseExpiresAt: { $gt: now },
    },
    { $set: { generationLeaseExpiresAt: new Date(now.getTime() + LESSON_GENERATION_LIMITS.leaseMs) } },
  );
  return result.matchedCount === 1;
}

export async function completeLessonGeneration({
  lessonId,
  courseId,
  attemptId,
  content,
  objectives,
}) {
  return Lesson.findOneAndUpdate(
    {
      _id: lessonId,
      course: courseId,
      isEnriched: false,
      generationStatus: 'generating',
      generationAttemptId: attemptId,
      generationLeaseExpiresAt: { $gt: new Date() },
    },
    {
      $set: {
        content,
        objectives,
        isEnriched: true,
        generationStatus: 'ready',
      },
      $unset: {
        generationAttemptId: '',
        generationLeaseExpiresAt: '',
      },
    },
    {
      returnDocument: 'after',
      runValidators: true,
    },
  );
}

export async function failLessonGeneration({
  lessonId,
  courseId,
  attemptId,
}) {
  return Lesson.updateOne(
    {
      _id: lessonId,
      course: courseId,
      isEnriched: false,
      generationStatus: 'generating',
      generationAttemptId: attemptId,
    },
    {
      $set: {
        generationStatus: 'failed',
      },
      $unset: {
        generationAttemptId: '',
        generationLeaseExpiresAt: '',
      },
    },
  );
}
