import assert from 'node:assert/strict';
import { createLearningStore } from '../src/lib/learningStore.js';
import { buildLessonReader } from '../src/lib/lessonReader.js';
import { api } from '../src/lib/api.js';
import { subscribeToGeneration } from '../src/lib/generationEvents.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const activity = (completed = false, attempts = []) => ({
  progress: { completed, completedAt: completed ? '2026-11-06T09:00:00Z' : null, lastOpenedAt: null },
  questions: [{ questionIndex: 2, version: 'v1', attemptCount: attempts.length, latestAttempt: attempts[0] ?? null }],
  attempts, nextCursor: null,
});
const attempt = { id: 'a1', submissionId: 's1', questionIndex: 2, questionVersion: 'v1',
  selectedOption: 1, correctOption: 1, isCorrect: true, question: 'Question', options: ['A', 'B'], explanation: 'Why' };
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function verify() {
  const reads = [];
  const writes = [];
  const saves = [];
  const fakeApi = {
    get(path) { const read = deferred(); reads.push({ path, ...read }); return read.promise; },
    postAction(path, body) {
      writes.push({ path, body });
      if (path.endsWith('/visit')) return Promise.resolve({ progress: activity().progress });
      return Promise.resolve({ attempt, replayed: false });
    },
    put(path, body) { const save = deferred(); saves.push({ path, body, ...save }); return save.promise; },
  };
  const store = createLearningStore({ api: fakeApi, lessonId: 'one' });
  store.start();
  store.stop();
  store.start();
  assert.equal(writes.length, 1, 'Strict Mode restart should not record two visits.');
  const first = store.refresh();
  const second = store.refresh();
  reads[1].resolve(activity(true));
  await second;
  reads[0].resolve(activity(false));
  await first;
  assert.equal(store.getSnapshot().data.progress.completed, true);
  console.log('PASS: Lesson visits are shared across effect restarts; late reads cannot overwrite newer activity.');

  const save = store.complete(false);
  assert.equal(store.getSnapshot().data.progress.completed, true, 'Do not show a save before acknowledgement.');
  saves[0].reject(new Error('Connection lost'));
  await assert.rejects(save, /Connection lost/);
  assert.equal(store.getSnapshot().data.progress.completed, true);
  const saveAgain = store.complete(false);
  saves[1].resolve({ progress: activity(false).progress });
  await saveAgain;
  assert.equal(store.getSnapshot().data.progress.completed, false);
  reads.at(-1).reject(new Error('Refresh failed'));
  await tick();
  assert.equal(store.getSnapshot().data.progress.completed, false);
  assert.equal(store.getSnapshot().error.message, 'Refresh failed');
  console.log('PASS: Completion waits for acknowledgement; failed writes and failed follow-up reads preserve the known saved result.');

  assert.deepEqual(await store.submit({ submissionId: 's1' }), attempt);
  assert.equal(store.getSnapshot().data.questions[0].latestAttempt.id, 'a1');
  reads.at(-1).reject(new Error('History temporarily unavailable'));
  await tick();
  assert.equal(store.getSnapshot().data.attempts.length, 1);
  fakeApi.postAction = async (path, body) => { writes.push({ path, body }); return { attempt, replayed: true }; };
  await store.submit({ submissionId: 's1' });
  assert.equal(store.getSnapshot().data.attempts.length, 1);
  reads.at(-1).resolve({ ...activity(false, [attempt]), nextCursor: 'cursor-1' });
  await tick();
  const page = store.loadMore();
  const pageRead = reads.at(-1);
  assert.match(pageRead.path, /before=cursor-1/);
  const newer = store.refresh();
  reads.at(-1).resolve(activity(false, [attempt]));
  await newer;
  pageRead.resolve({ ...activity(false, [{ ...attempt, id: 'old' }]), nextCursor: null });
  await page;
  assert.deepEqual(store.getSnapshot().data.attempts.map((item) => item.id), ['a1']);
  console.log('PASS: A saved answer remains successful after refresh failure; replayed results deduplicate and obsolete history pages are ignored.');

  const late = store.refresh();
  store.stop();
  const before = store.getSnapshot();
  reads.at(-1).resolve(activity(true));
  await late;
  assert.equal(store.getSnapshot(), before);
  const other = createLearningStore({ api: fakeApi, lessonId: 'two' });
  assert.equal(other.getSnapshot().data, null);
  assert.equal(createLearningStore({ api: fakeApi, lessonId: 'one' }).getSnapshot().data, null);
  console.log('PASS: Leaving a lesson ignores late results; new lesson/account stores inherit no saved selections.');

  const question = { type: 'mcq', question: 'Q', options: ['A', 'B'], answer: 1, explanation: 'Why' };
  const raw = [{ type: 'heading', text: 'Title' }, { type: 'paragraph', text: 'Body' }, question];
  const model = buildLessonReader({ title: 'Title', content: raw });
  const index = model.blocks.findIndex((block) => block.type === 'mcq');
  assert.equal(index + model.sourceOffset, 2);
  assert.equal(raw[index + model.sourceOffset], question);
  assert.equal(buildLessonReader({ title: 'Other', content: raw }).sourceOffset, 0);
  console.log('PASS: Removing an echoed title does not shift the question index sent to the server.');

  const originalFetch = globalThis.fetch;
  let signals = 0;
  const calls = [];
  const unsubscribe = subscribeToGeneration(() => { signals += 1; });
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return Response.json({ ok: true });
  };
  try {
    await api.postAction('/api/lessons/one/visit');
    await api.postAction('/api/lessons/one/quiz-attempts', { submissionId: 'retry-id' });
    await api.put('/api/lessons/one/progress', { completed: true });
    assert.equal(signals, 0);
    assert.equal(calls.at(-1).options.method, 'PUT');
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), { completed: true });
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    await assert.rejects(api.postAction('/api/lessons/one/quiz-attempts', {}));
    assert.equal(signals, 0);
    console.log('PASS: Learning writes and their failures do not emit paid-generation or quota-refresh events.');
  } finally { unsubscribe(); globalThis.fetch = originalFetch; }
}

verify().catch((error) => { console.error('FAIL:', error); process.exitCode = 1; });
