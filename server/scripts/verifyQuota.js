import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import DailyUsage from '../models/DailyUsage.js';
import { consumeDailyQuota } from '../services/usageService.js';

dotenv.config({
  path: new URL('../../.env', import.meta.url),
  quiet: true,
});

async function verify() {
  assert.ok(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI first.');

  // A fresh identity keeps this test separate from real usage.
  const creator = `guest:${randomUUID()}`;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  await mongoose.connect(process.env.TEST_MONGO_URI, {
    dbName: 'learnsmith_generation_test',
    serverSelectionTimeoutMS: 8000,
  });

  try {
    // Start ten competing quota requests and wait for ALL results.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        consumeDailyQuota({
          creator,
          identityType: 'guest',
          resource: 'lessons',
          now,
        }),
      ),
    );

    const accepted = results.filter(
      (result) => result.status === 'fulfilled',
    );

    const rejected = results.filter(
      (result) => result.status === 'rejected',
    );

    assert.equal(accepted.length, 5);
    assert.equal(rejected.length, 5);

    for (const result of rejected) {
      assert.equal(result.reason.statusCode, 429);
      assert.equal(result.reason.code, 'daily_quota_exceeded');
    }

    // Verify what was actually stored, not just return values.
    const records = await DailyUsage.find({ creator, day }).lean();

    assert.equal(records.length, 1);
    assert.equal(records[0].lessons, 5);
    assert.equal(records[0].courses, 0);

    console.log('PASS: Five requests accepted; five rejected with 429.');
    console.log('PASS: One daily record; lessons = 5, courses = 0.');
  } finally {
    try {
      await DailyUsage.deleteMany({ creator });
    } finally {
      await mongoose.disconnect();
    }
  }
}

verify().catch((err) => {
  console.error('FAIL:', err);
  process.exitCode = 1;
});