import { randomUUID } from 'node:crypto';
import Lesson from '../models/Lesson.js';

// Initial policy: five minutes.
// This is a conservative starting value, not a proven upper bound.
// Review it against retries, video lookup, and database latency.
const LEASE_MS = 5 * 60 * 1000;

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
      ],
    },
    {
      $set: {
        generationStatus: 'generating',
        generationAttemptId: attemptId,
        generationLeaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      },
    },
    {
      returnDocument: 'after',
      runValidators: true,
    },
  );

  return lesson ? { lesson, attemptId } : null;
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