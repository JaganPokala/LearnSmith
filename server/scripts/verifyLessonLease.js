import assert from 'node:assert/strict';
import { startLessonGenerationLease } from '../services/lessonGenerationLease.js';
import { createLessonGenerator } from '../services/lessonGenerator.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function clock() {
  let time = 0;
  const jobs = new Map();
  return {
    now: () => time,
    schedule(fn, ms) {
      const timer = { unref() {} };
      jobs.set(timer, { at: time + ms, fn });
      return timer;
    },
    unschedule: (timer) => jobs.delete(timer),
    pending: () => jobs.size,
    async advance(ms) {
      const target = time + ms;
      while (true) {
        const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        time = next[1].at;
        jobs.delete(next[0]);
        await next[1].fn();
      }
      time = target;
    },
  };
}

async function verify() {
  const time = clock();
  let expiresAt = 30_000;
  let renewals = 0;
  const alive = startLessonGenerationLease({}, { ...time, renew: async () => {
    if (time.now() >= expiresAt) return false;
    renewals += 1;
    expiresAt = time.now() + 30_000;
    return true;
  } });
  await time.advance(65_000);
  assert.equal(renewals, 6);
  assert.equal(expiresAt, 90_000);
  alive.stop();
  assert.equal(time.pending(), 0);
  await time.advance(31_000);
  assert.ok(time.now() > expiresAt);
  assert.equal(renewals, 6);
  console.log('PASS: Work can stay healthy beyond 30 seconds; stopped heartbeats permit recovery after the last lease expires.');

  const lostTime = clock();
  const waiting = deferred();
  const lost = startLessonGenerationLease({}, { ...lostTime, renew: async () => false });
  const lostWork = lost.run(() => waiting.promise);
  lostWork.catch(() => {});
  await lostTime.advance(10_000);
  await assert.rejects(lostWork, { code: 'generation_claim_lost' });
  await assert.rejects(lost.check(), { code: 'generation_claim_lost' });
  assert.equal(lostTime.pending(), 0);
  waiting.resolve();
  console.log('PASS: A lost owner stops renewal and cannot start another stage.');

  const brokenTime = clock();
  const broken = startLessonGenerationLease({}, { ...brokenTime, renew: async () => { throw new Error('Database unavailable'); } });
  await assert.rejects(broken.run(() => broken.check()), { code: 'generation_claim_unavailable' });
  assert.equal(brokenTime.pending(), 0);
  console.log('PASS: Unconfirmed ownership fails closed before new paid work.');

  const deadlineTime = clock();
  const stalled = deferred();
  let laterStages = 0;
  const bounded = startLessonGenerationLease({}, { ...deadlineTime, renew: async () => true });
  const work = bounded.run(async () => {
    await stalled.promise;
    await bounded.check();
    laterStages += 1;
  });
  work.catch(() => {});
  await deadlineTime.advance(120_000);
  await assert.rejects(work, { code: 'generation_timeout' });
  assert.equal(deadlineTime.pending(), 0);
  stalled.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(laterStages, 0);
  console.log('PASS: A live but stuck request reaches its overall deadline and cannot continue into another stage.');

  const sharedTime = clock();
  const renewal = deferred();
  let concurrentRenewals = 0;
  const shared = startLessonGenerationLease({}, { ...sharedTime, renew: async () => { concurrentRenewals += 1; return renewal.promise; } });
  const checks = [shared.check(), shared.check()];
  await Promise.resolve();
  assert.equal(concurrentRenewals, 1);
  renewal.resolve(true);
  await Promise.all(checks);
  shared.stop();
  assert.equal(sharedTime.pending(), 0);
  console.log('PASS: Overlapping heartbeat/stage checks share one renewal and timers are cleaned up.');

  let paidCalls = 0;
  let checksBeforeAttempt = 0;
  const generator = createLessonGenerator({
    generate: async () => { paidCalls += 1; return { text: '{}' }; },
    tracker: { validation: async () => {} },
  });
  await assert.rejects(generator({ lessonTitle: 'Lease test' }, {
    creator: 'lease-test', generationId: 'test-generation',
    beforeProviderCall: async () => {
      checksBeforeAttempt += 1;
      if (checksBeforeAttempt === 2) throw Object.assign(new Error('Lost ownership'), { code: 'generation_claim_lost' });
    },
  }), { code: 'generation_claim_lost' });
  assert.equal(paidCalls, 1);
  console.log('PASS: Ownership loss before a content retry prevents a second provider call.');
}

verify().catch((err) => { console.error('FAIL:', err); process.exitCode = 1; });
