import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createCourseHandler } from '../controllers/courseController.js';
import { ApiError, errorHandler } from '../middlewares/errorHandler.js';
import { ready, clarify, rejected } from './fixtures/courseDecisions.js';

const creator = 'guest:mock-course-owner';
const expectedCourse = { _id: 'saved-course', ...ready.course };
let calls;
let mode;
let generationId;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.creator = creator;
  req.identityType = 'guest';
  next();
});
app.post('/api/courses/generate', createCourseHandler({
  reserve: async (args) => {
    calls.push('reserve');
    assert.equal(args.creator, creator);
    assert.equal(args.identityType, 'guest');
    generationId = args.generationId;
    assert.match(generationId, /^[0-9a-f-]{36}$/);
    if (mode.endsWith('_exceeded')) throw new ApiError(429, mode, 'Daily limit reached');
    return { creator, generationId, day: '2026-11-14' };
  },
  generate: async (topic, tracking) => {
    calls.push('generate');
    assert.equal(topic, 'Learn C++');
    assert.deepEqual(tracking, { creator, generationId });
    if (mode === 'provider') throw new ApiError(502, 'ai_unavailable', 'Provider unavailable');
    if (mode === 'unparseable') throw new ApiError(502, 'ai_unparseable', 'Invalid JSON');
    const decisions = {
      clarify, rejected,
      scope: { ...rejected, reasonCode: 'out_of_scope' },
      unsafe: { ...rejected, reasonCode: 'unsafe' },
      invalid: { ...clarify, course: ready.course },
    };
    return { ...(decisions[mode] ?? ready), attempts: 1, ms: 0 };
  },
  save: async (course, owner) => {
    calls.push('save');
    assert.equal(owner, creator);
    assert.deepEqual(course, ready.course);
    if (mode === 'save_failure') throw new ApiError(503, 'database_unavailable', 'Save failed');
    return expectedCourse;
  },
  settle: async (reservation, { refundCourse }) => {
    calls.push(refundCourse ? 'refund' : 'settle');
    assert.deepEqual(reservation, { creator, generationId, day: '2026-11-14' });
    if (mode === 'settlement_failure') throw new Error('Settlement failed');
  },
}));
app.use(errorHandler);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');

async function submit(nextMode, prompt = '  Learn \n C++  ') {
  mode = nextMode;
  calls = [];
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/courses/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return { status: response.status, body: await response.json() };
}

try {
  for (const [prompt, code] of [
    [42, 'missing_prompt'], ['  ', 'empty_prompt'], ['!!! 🚀', 'topic_not_meaningful'],
    ['a'.repeat(201), 'prompt_too_long'],
  ]) {
    const result = await submit('ready', prompt);
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, code);
    assert.deepEqual(calls, []);
  }
  for (const mode of ['ready', 'settlement_failure']) {
    assert.deepEqual(await submit(mode), { status: 201, body: expectedCourse });
    assert.deepEqual(calls, ['reserve', 'generate', 'save', 'settle']);
  }
  for (const [mode, decision, code] of [
    ['clarify', clarify, 'topic_needs_clarification'],
    ['rejected', rejected, 'topic_not_meaningful'],
    ['scope', rejected, 'topic_out_of_scope'],
    ['unsafe', rejected, 'unsafe_topic'],
  ]) {
    const result = await submit(mode);
    assert.equal(result.status, 422);
    assert.equal(result.body.error.code, code);
    assert.equal(result.body.error.message, decision.message);
    assert.deepEqual(result.body.error.suggestions, decision.suggestions);
    assert.deepEqual(calls, ['reserve', 'generate', 'refund']);
  }
  for (const code of ['daily_quota_exceeded', 'daily_course_attempts_exceeded']) {
    const result = await submit(code);
    assert.equal(result.status, 429);
    assert.equal(result.body.error.code, code);
    assert.deepEqual(calls, ['reserve']);
  }
  for (const [mode, code] of [
    ['provider', 'ai_unavailable'], ['invalid', 'ai_invalid_course_decision'],
    ['unparseable', 'ai_unparseable'], ['save_failure', 'database_unavailable'],
  ]) {
    const result = await submit(mode);
    assert.equal(result.status, mode === 'save_failure' ? 503 : 502);
    assert.equal(result.body.error.code, code);
    assert.deepEqual(calls, ['reserve', 'generate', ...(mode === 'save_failure' ? ['save'] : []), 'settle']);
  }
  console.log('PASS: Course HTTP responses, side effects, limit handling, and settlement failures follow the contract.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
