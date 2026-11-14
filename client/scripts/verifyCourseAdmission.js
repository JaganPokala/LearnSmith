import assert from 'node:assert/strict';
import { api } from '../src/lib/api.js';
import { describeError } from '../src/lib/errors.js';
import { subscribeToGeneration } from '../src/lib/generationEvents.js';

const question = 'Which Mercury would you like to learn about?';
const suggestions = ['The planet Mercury', 'The chemical element mercury'];
const originalFetch = globalThis.fetch;
let response;
let settled = 0;
const unsubscribe = subscribeToGeneration(() => { settled += 1; });
const submit = () => api.post('/api/courses/generate', { prompt: 'Mercury' });
globalThis.fetch = async (path) => {
  if (path === '/api/session') return Response.json({ ready: true });
  assert.equal(path, '/api/courses/generate');
  return response;
};

try {
  response = Response.json({ error: {
    code: 'topic_needs_clarification', message: question,
    suggestions: [17, '   ', 'x'.repeat(201), ...suggestions, 'Mercury in mythology', 'Fourth suggestion'],
  } }, { status: 422 });
  await assert.rejects(submit(), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.code, 'topic_needs_clarification');
    assert.equal(error.message, question);
    assert.deepEqual(error.suggestions, [...suggestions, 'Mercury in mythology']);
    assert.deepEqual(describeError(error), { title: question, retry: false });
    return true;
  });
  assert.equal(settled, 1);

  for (const [code, status] of [['topic_not_meaningful', 422], ['daily_course_attempts_exceeded', 429]]) {
    const message = 'Enter another topic or try again tomorrow.';
    response = Response.json({ error: { code, message, suggestions } }, { status });
    await assert.rejects(submit(), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.equal(error.suggestions, undefined);
      assert.equal(describeError(error).retry, false);
      assert.equal(describeError(error).detail, message);
      return true;
    });
  }
  assert.equal(settled, 3);

  response = new Response('<html>Unavailable</html>', { status: 503 });
  await assert.rejects(submit(), { code: 'unknown_error', status: 503 });
  const course = { _id: 'saved-course', title: 'The planet Mercury' };
  response = Response.json(course, { status: 201 });
  assert.deepEqual(await submit(), course);
  assert.equal(settled, 5);
  console.log('PASS: Topic errors preserve valid suggestions, every outcome refreshes usage, and 201 remains compatible.');
} finally {
  unsubscribe();
  globalThis.fetch = originalFetch;
}
