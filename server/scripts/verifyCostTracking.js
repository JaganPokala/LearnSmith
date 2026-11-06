import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import GenerationCall from '../models/GenerationCall.js';
import DailyUsage from '../models/DailyUsage.js';
import { createJSONGenerator } from '../services/openai.js';
import { createCourseGenerator } from '../services/courseGenerator.js';
import { createLessonGenerator } from '../services/lessonGenerator.js';
import { createGenerationTracker, estimateTextCost } from '../services/generationTracking.js';
import { getUsage } from '../controllers/usageController.js';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });

const OWNER = `cost-test:${randomUUID()}`;
const OTHER = `cost-test:${randomUUID()}`;
const EMPTY = `cost-test:${randomUUID()}`;
const owners = [OWNER, OTHER, EMPTY];
const model = 'gpt-4.1-mini-2025-04-14';
const usage = {
  prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500,
  prompt_tokens_details: { cached_tokens: 400, audio_tokens: 0 },
  completion_tokens_details: { reasoning_tokens: 100, audio_tokens: 0 },
};

const lesson = {
  title: 'Test lesson', objectives: ['Understand accounting'],
  content: [
    { type: 'heading', text: 'Accounting' },
    { type: 'paragraph', text: 'Each provider call consumes resources.' },
    { type: 'video', query: 'API usage accounting tutorial' },
    { type: 'mcq', question: 'Which calls count?', options: ['Every attempt', 'Only successful lessons'],
      answer: 0, explanation: 'Invalid responses may still consume tokens.' },
  ],
};

const course = {
  title: 'Accounting', description: 'Test provider accounting.', tags: ['testing'],
  modules: Array.from({ length: 3 }, (_, i) => ({
    title: `Module ${i + 1}`,
    lessons: Array.from({ length: 3 }, (_, j) => ({ title: `Lesson ${i + 1}.${j + 1}` })),
  })),
};

function context() {
  return { creator: OWNER, generationId: randomUUID() };
}

function response(content = '{}', overrides = {}) {
  return {
    id: `fake-${randomUUID()}`, _request_id: `fake-request-${randomUUID()}`,
    model, service_tier: 'default', usage,
    choices: [{ finish_reason: 'stop', message: { content } }],
    ...overrides,
  };
}

function provider(sequence, tracker) {
  let calls = 0;
  const generate = createJSONGenerator({
    tracker,
    complete: async (body) => {
      calls += 1;
      assert.equal(body.service_tier, 'default');
      assert.ok(sequence.length, 'Unexpected additional provider call');
      const next = sequence.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { generate, calls: () => calls };
}

function jsonArgs(ctx) {
  return {
    messages: [], schema: {}, schemaName: 'test',
    tracking: { ...ctx, operation: 'lesson', attemptNumber: 1 },
  };
}

async function rows(ctx) {
  return GenerationCall.find({ generationId: ctx.generationId }).sort({ attemptNumber: 1 }).lean();
}

async function readUsage(creator = OWNER) {
  let body;
  const headers = {};
  await getUsage({ creator, identityType: 'user' }, {
    set: (name, value) => { headers[name] = value; },
    json: (value) => { body = value; },
  });
  assert.equal(headers['Cache-Control'], 'private, no-store');
  return body;
}

async function verify() {
  // Pure arithmetic: cached input and reasoning must not be counted twice.
  const estimate = estimateTextCost({ model, usage, serviceTier: 'default' });
  assert.equal(estimate.estimatedCostUsd, 0.00108);
  assert.equal(estimate.pricingSnapshot.version, '2026-11-06');
  assert.equal(estimateTextCost({ model: 'future-model', usage, serviceTier: 'default' }).costStatus, 'unsupported_model');
  assert.equal(estimateTextCost({ model: 'toString', usage, serviceTier: 'default' }).costStatus, 'unsupported_model');
  assert.equal(estimateTextCost({ model, usage: undefined, serviceTier: 'default' }).estimatedCostUsd, null);
  assert.equal(estimateTextCost({ model, usage, serviceTier: 'priority' }).estimatedCostUsd, null);
  assert.equal(estimateTextCost({ model, usage: {
    ...usage, prompt_tokens_details: { cached_tokens: 1001 },
  }, serviceTier: 'default' }).costStatus, 'invalid_usage');
  assert.equal(estimateTextCost({ model, usage: {
    ...usage, prompt_tokens_details: { cached_tokens: 400, cache_write_tokens: 2 },
  }, serviceTier: 'default' }).costStatus, 'unsupported_usage');
  console.log('PASS: Pricing handles cached tokens, reasoning, missing usage, and unsupported rates.');

  assert.ok(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI first.');
  await mongoose.connect(process.env.TEST_MONGO_URI, {
    dbName: 'learnsmith_generation_test', serverSelectionTimeoutMS: 8000,
  });

  try {
    const logs = [];
    const tracker = createGenerationTracker({ logError: (...args) => logs.push(args) });

    // Every validation retry must retain usage and one grouping ID.
    const ctx = context();
    const fake = provider([response('{}'), response(JSON.stringify(lesson))], tracker);
    const generateLesson = createLessonGenerator({ generate: fake.generate, tracker });
    const result = await generateLesson({ courseTitle: 'Test', moduleTitle: 'Test', lessonTitle: 'Test' }, ctx);
    assert.equal(result.attempts, 2);
    assert.equal(fake.calls(), 2);
    const lessonRows = await rows(ctx);
    assert.equal(lessonRows.length, 2);
    assert.deepEqual(lessonRows.map((row) => row.attemptNumber), [1, 2]);
    assert.deepEqual(lessonRows.map((row) => row.validationStatus), ['rejected', 'accepted']);
    for (const row of lessonRows) {
      assert.equal(row.creator, OWNER);
      assert.equal(row.operation, 'lesson');
      assert.equal(row.outcome, 'response_received');
      assert.equal(row.estimatedCostUsd, 0.00108);
      assert.equal(row.inputTokens, 1000);
      assert.equal(row.cachedInputTokens, 400);
      assert.equal(row.outputTokens, 500);
      assert.ok(row.providerResponseId);
      assert.ok(row.providerRequestId);
      assert.equal(row.content, undefined);
      assert.equal(row.messages, undefined);
    }
    console.log('PASS: Rejected lesson output and its successful retry both retain token usage and cost.');

    const courseContext = context();
    const fakeCourse = provider([response(JSON.stringify(course))], tracker);
    await createCourseGenerator({ generate: fakeCourse.generate, tracker })('Accounting', courseContext);
    assert.equal((await rows(courseContext))[0].validationStatus, 'accepted');
    assert.equal((await rows(courseContext))[0].operation, 'course');
    console.log('PASS: Course generation records its owner, grouping ID, and validation result.');

    const cutContext = context();
    const truncated = provider([
      response('unfinished', { choices: [{ finish_reason: 'length', message: { content: 'unfinished' } }] }),
      response(JSON.stringify(lesson)),
    ], tracker);
    await createLessonGenerator({ generate: truncated.generate, tracker })(
      { courseTitle: 'Test', moduleTitle: 'Test', lessonTitle: 'Test' }, cutContext,
    );
    const cutRows = await rows(cutContext);
    assert.equal(cutRows[0].finishReason, 'length');
    assert.equal(cutRows[0].validationStatus, 'rejected');
    assert.equal(cutRows[0].estimatedCostUsd, 0.00108);
    console.log('PASS: Truncated responses retain usage before the wrapper rejects them.');

    const timeoutContext = context();
    const timeout = Object.assign(new Error('Simulated timeout'), {
      name: 'APIConnectionTimeoutError', code: 'ETIMEDOUT',
    });
    const timed = provider([timeout, response(JSON.stringify(lesson))], tracker);
    await createLessonGenerator({ generate: timed.generate, tracker })(
      { courseTitle: 'Test', moduleTitle: 'Test', lessonTitle: 'Test' }, timeoutContext,
    );
    const timeoutRows = await rows(timeoutContext);
    assert.equal(timeoutRows[0].outcome, 'unknown');
    assert.equal(timeoutRows[0].estimatedCostUsd, null);
    assert.equal(timeoutRows[0].inputTokens, null);
    assert.equal(timeoutRows[1].validationStatus, 'accepted');

    const rejectedContext = context();
    const rejected = provider([Object.assign(new Error('Simulated rejection'), { status: 401 })], tracker);
    await assert.rejects(rejected.generate(jsonArgs(rejectedContext)), { code: 'ai_unavailable' });
    assert.equal((await rows(rejectedContext))[0].outcome, 'request_failed');
    console.log('PASS: Timeouts remain unknown; explicit provider rejections are recorded separately.');

    const missingContext = context();
    await provider([response('{}', { usage: undefined })], tracker).generate(jsonArgs(missingContext));
    assert.equal((await rows(missingContext))[0].costStatus, 'missing_usage');
    assert.equal((await rows(missingContext))[0].estimatedCostUsd, null);

    const futureContext = context();
    await provider([response('{}', { model: 'future-model' })], tracker).generate(jsonArgs(futureContext));
    assert.equal((await rows(futureContext))[0].costStatus, 'unsupported_model');
    console.log('PASS: Missing usage and unknown model rates never become zero-cost estimates.');

    // A pre-call failure prevents spend; a post-call write failure must not
    // trigger another paid call merely to recover accounting metadata.
    const unavailable = createGenerationTracker({
      CallModel: { init: async () => { throw new Error('Simulated database failure'); } },
    });
    const notStarted = provider([response(JSON.stringify(course))], unavailable);
    await assert.rejects(
      createCourseGenerator({ generate: notStarted.generate, tracker: unavailable })('Test', context()),
      { code: 'tracking_unavailable' },
    );
    assert.equal(notStarted.calls(), 0);

    const updateFailure = createGenerationTracker({
      CallModel: {
        init: () => GenerationCall.init(),
        create: (data) => GenerationCall.create(data),
        updateOne: async () => { throw new Error('Simulated write failure'); },
      },
      logError: (...args) => logs.push(args),
    });
    const updateContext = context();
    const paidOnce = provider([response(JSON.stringify(course))], updateFailure);
    const stillReturned = await createCourseGenerator({ generate: paidOnce.generate, tracker: updateFailure })(
      'Test', updateContext,
    );
    assert.equal(stillReturned.attempts, 1);
    assert.equal(paidOnce.calls(), 1);
    assert.equal((await rows(updateContext))[0].outcome, 'unknown');
    assert.ok(logs.some(([event]) => event === 'generation_accounting_write_failed'));
    console.log('PASS: Accounting outage prevents new spend or preserves a paid result without duplicate calls.');

    const duplicateContext = context();
    const duplicate = provider([response()], tracker);
    await duplicate.generate(jsonArgs(duplicateContext));
    await assert.rejects(duplicate.generate(jsonArgs(duplicateContext)), { code: 'tracking_unavailable' });
    assert.equal(duplicate.calls(), 1);
    console.log('PASS: Duplicate generation/attempt keys cannot start a second provider call.');

    // Reporting includes retries and unknowns, but never another owner's calls
    // or records from yesterday. Reading does not create quota documents.
    const day = new Date().toISOString().slice(0, 10);
    await DailyUsage.create({ creator: OWNER, day, courses: 2, lessons: 3 });
    const otherRecord = await GenerationCall.create({
      creator: OTHER, generationId: randomUUID(), operation: 'course', attemptNumber: 1,
      requestedModel: model, estimatedCostUsd: 999,
    });
    const oldRecord = await GenerationCall.create({
      creator: OWNER, generationId: randomUUID(), operation: 'course', attemptNumber: 1,
      requestedModel: model, estimatedCostUsd: 100,
    });
    const midnight = new Date(`${day}T00:00:00.000Z`);
    await GenerationCall.collection.updateOne(
      { _id: oldRecord._id }, { $set: { createdAt: new Date(midnight.getTime() - 1000) } },
    );
    const report = await readUsage();
    const today = await GenerationCall.find({ creator: OWNER, createdAt: { $gte: midnight } }).lean();
    const subtotal = today.reduce((sum, row) => sum + (row.estimatedCostUsd ?? 0), 0);
    assert.equal(report.generation.calls, today.length);
    assert.ok(Math.abs(report.generation.knownEstimatedCostUsd - subtotal) < 1e-12);
    assert.equal(report.generation.estimatedCostUsd, null);
    assert.equal(report.generation.costStatus, 'partial');
    assert.ok(report.generation.unknownOutcomeCalls >= 2);
    assert.ok(report.generation.rejectedContentCalls >= 2);
    assert.ok(report.generation.incompleteUsageCalls >= 1);
    assert.equal(report.quota.courses.used, 2);
    assert.equal(report.quota.lessons.remaining, 17);
    assert.ok(otherRecord._id);
    const empty = await readUsage(EMPTY);
    assert.equal(empty.generation.calls, 0);
    assert.equal(empty.generation.estimatedCostUsd, 0);
    assert.equal(empty.quota.lessons.used, 0);
    assert.equal(await DailyUsage.countDocuments({ creator: EMPTY }), 0);
    console.log('PASS: Usage reporting scopes by owner and UTC day and labels incomplete cost totals.');
  } finally {
    try {
      await GenerationCall.deleteMany({ creator: { $in: owners } });
      await DailyUsage.deleteMany({ creator: { $in: owners } });
    } finally {
      await mongoose.disconnect();
    }
  }
}

verify().catch((err) => {
  console.error('FAIL:', err);
  process.exitCode = 1;
});
