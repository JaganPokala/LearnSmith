import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import Lesson from '../models/Lesson.js';
import {
  claimLessonGeneration,
  completeLessonGeneration,
  failLessonGeneration,
} from '../services/lessonGenerationState.js';

dotenv.config({
  path: new URL('../../.env', import.meta.url),
  quiet: true,
});

const createdIds = [];

async function createFixture() {
  const lesson = await Lesson.create({
    title: 'Generation protection test',
    course: new mongoose.Types.ObjectId(),
    module: new mongoose.Types.ObjectId(),
  });

  createdIds.push(lesson._id);

  return {
    lessonId: lesson._id,
    courseId: lesson.course,
  };
}

// Moves the expiration into the past without waiting five minutes.
async function expireLease(lessonId) {
  await Lesson.updateOne(
    { _id: lessonId },
    {
      $set: {
        generationLeaseExpiresAt: new Date(Date.now() - 1000),
      },
    },
  );
}

function complete(fixture, attemptId) {
  return completeLessonGeneration({
    ...fixture,
    attemptId,
    content: [{ type: 'paragraph', text: 'Test content' }],
    objectives: ['Understand generation protection'],
  });
}

async function verify() {
  assert.ok(
    process.env.TEST_MONGO_URI,
    'Set TEST_MONGO_URI before running this script.',
  );

  await mongoose.connect(process.env.TEST_MONGO_URI, {
    dbName: 'learnsmith_generation_test',
    serverSelectionTimeoutMS: 8000,
  });

  try {
    // TEST 1: Ten competing requests, exactly one claim.
    const first = await createFixture();

    const claims = await Promise.all(
      Array.from({ length: 10 }, () =>
        claimLessonGeneration(first.lessonId, first.courseId),
      ),
    );

    const winners = claims.filter(Boolean);
    assert.equal(winners.length, 1);

    const winner = winners[0];

    console.log('PASS: Only one concurrent claim succeeds.');

    // TEST 2: The owner can save; ready lessons cannot be claimed.
    const saved = await complete(first, winner.attemptId);

    assert.ok(saved);
    assert.equal(saved.isEnriched, true);
    assert.equal(saved.generationStatus, 'ready');

    const repeatClaim = await claimLessonGeneration(
      first.lessonId,
      first.courseId,
    );

    assert.equal(repeatClaim, null);

    console.log('PASS: Completion works and blocks regeneration.');

    // TEST 3: Failure releases the lesson for another attempt.
    const second = await createFixture();
    const failedAttempt = await claimLessonGeneration(
      second.lessonId,
      second.courseId,
    );

    assert.ok(failedAttempt);

    await failLessonGeneration({
      ...second,
      attemptId: failedAttempt.attemptId,
    });

    const failedLesson = await Lesson.findById(second.lessonId);

    assert.equal(failedLesson.generationStatus, 'failed');
    assert.equal(failedLesson.isEnriched, false);

    const retry = await claimLessonGeneration(
      second.lessonId,
      second.courseId,
    );

    assert.ok(retry);
    assert.notEqual(retry.attemptId, failedAttempt.attemptId);

    console.log('PASS: Failed generation can be retried.');

    // TEST 4: An expired attempt cannot save, even before takeover.
    const third = await createFixture();
    const attemptA = await claimLessonGeneration(
      third.lessonId,
      third.courseId,
    );

    assert.ok(attemptA);

    await expireLease(third.lessonId);

    const expiredSave = await complete(third, attemptA.attemptId);

    assert.equal(expiredSave, null);

    console.log('PASS: Expired attempts cannot save.');

    // TEST 5: Another request can reclaim an expired lesson.
    const attemptB = await claimLessonGeneration(
      third.lessonId,
      third.courseId,
    );

    assert.ok(attemptB);
    assert.notEqual(attemptB.attemptId, attemptA.attemptId);

    console.log('PASS: Expired claims can be recovered.');

    // TEST 6: A cannot save or mark B's generation as failed.
    const staleSave = await complete(third, attemptA.attemptId);

    assert.equal(staleSave, null);

    const staleFailure = await failLessonGeneration({
      ...third,
      attemptId: attemptA.attemptId,
    });

    assert.equal(staleFailure.modifiedCount, 0);

    const current = await Lesson.findById(third.lessonId);

    assert.equal(current.generationStatus, 'generating');
    assert.equal(current.generationAttemptId, attemptB.attemptId);

    // B should still be able to complete successfully.
    const validSave = await complete(third, attemptB.attemptId);

    assert.ok(validSave);
    assert.equal(validSave.isEnriched, true);

    console.log('PASS: Stale attempts cannot interfere with the new owner.');
  } finally {
    try {
      await Lesson.deleteMany({ _id: { $in: createdIds } });
    } finally {
      await mongoose.disconnect();
    }
  }
}

verify().catch((err) => {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
});