import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DailyUsage from '../models/DailyUsage.js';
import { createCourseAdmission, reserveCourseAttempt, settleCourseAttempt } from '../services/courseAdmission.js';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
assert.ok(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI first.');

const owners = [];
function owner() {
  const creator = `guest:course-admission-test:${randomUUID()}`;
  owners.push(creator);
  return creator;
}
const now = new Date('2026-11-14T23:59:59.999Z');
const day = '2026-11-14';
const nextDay = new Date('2026-11-15T00:00:00.000Z');
const reserve = (creator, time = now) => reserveCourseAttempt({
  creator, identityType: 'guest', generationId: randomUUID(), now: time,
});
const refund = (reservation) => settleCourseAttempt(reservation, { refundCourse: true });
const usage = (creator, date = day) => DailyUsage.findOne({ creator, day: date }).lean();

await mongoose.connect(process.env.TEST_MONGO_URI, {
  dbName: 'learnsmith_generation_test', serverSelectionTimeoutMS: 8000,
});
try {
  const racing = owner();
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => reserve(racing)));
  const accepted = results.filter((result) => result.status === 'fulfilled');
  assert.equal(accepted.length, 1);
  assert.ok(results.filter((result) => result.status === 'rejected').every(
    (result) => result.reason.code === 'daily_quota_exceeded',
  ));
  assert.equal((await usage(racing)).courseAttempts, 1);
  assert.equal(await DailyUsage.countDocuments({ creator: racing, day }), 1);

  const first = accepted[0].value;
  await refund({ ...first, generationId: randomUUID() });
  await refund({ ...first, creator: owner() });
  assert.equal((await usage(racing)).courses, 1);
  const tomorrow = await reserve(racing, nextDay);
  await Promise.all(Array.from({ length: 12 }, () => refund(first)));
  assert.equal((await usage(racing)).courses, 0);
  assert.equal((await usage(racing)).courseAttempts, 1);
  assert.deepEqual((await usage(racing)).courseReservationIds, []);
  assert.equal((await usage(racing, tomorrow.day)).courses, 1);

  const current = await reserve(racing);
  await refund(first);
  assert.deepEqual((await usage(racing)).courseReservationIds, [current.generationId]);
  await settleCourseAttempt(current, { refundCourse: false });
  await refund(current);
  assert.equal((await usage(racing)).courses, 1);
  assert.deepEqual((await usage(racing)).courseReservationIds, []);
  assert.equal((await usage(racing, tomorrow.day)).courses, 1);
  assert.deepEqual((await usage(racing, tomorrow.day)).courseReservationIds, [tomorrow.generationId]);
  console.log('PASS: Concurrent reservations and exact-ID refunds protect quota, including across UTC midnight.');

  const legacy = owner();
  await DailyUsage.collection.insertOne({ creator: legacy, day, courses: 0, lessons: 0 });
  for (let i = 0; i < 10; i += 1) await refund(await reserve(legacy));
  assert.equal((await usage(legacy)).courses, 0);
  assert.equal((await usage(legacy)).courseAttempts, 10);
  await assert.rejects(reserve(legacy), { code: 'daily_course_attempts_exceeded' });

  const attemptRace = owner();
  // Keep course allowance above the attempt allowance to isolate that filter.
  const { reserveCourseAttempt: reserveForTest } = createCourseAdmission({
    resolveEntitlement: async () => ({ limits: { courses: 99 }, tier: 'guest' }),
  });
  const attempts = await Promise.allSettled(Array.from({ length: 14 }, () => reserveForTest({
    creator: attemptRace, identityType: 'guest', generationId: randomUUID(), now,
  })));
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 10);
  assert.ok(attempts.filter((result) => result.status === 'rejected').every(
    (result) => result.reason.code === 'daily_course_attempts_exceeded',
  ));
  assert.equal((await usage(attemptRace)).courseAttempts, 10);
  console.log('PASS: Legacy documents can reserve, and the attempt cap survives refunds and concurrent requests.');
} finally {
  try {
    await DailyUsage.deleteMany({ creator: { $in: owners } });
  } finally {
    await mongoose.disconnect();
  }
}
