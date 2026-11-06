import assert from 'node:assert/strict';
import { api, setTokenSource } from '../src/lib/api.js';
import { createUsageStore } from '../src/lib/usageStore.js';
import { subscribeToGeneration } from '../src/lib/generationEvents.js';

const usage = (remaining) => ({
  day: '2026-11-06', resetAt: '2026-11-07T00:00:00.000Z',
  quota: {
    courses: { used: 1 - remaining, limit: 1, remaining },
    lessons: { used: 0, limit: 5, remaining: 5 },
    audio: { used: 0, limit: 2, remaining: 2 },
  },
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function verify() {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let mode = 'ok';
  let notifications = 0;
  let snapshot = usage(1);
  globalThis.fetch = async (path, options = {}) => {
    requests.push({ path, options });
    if (path === '/api/session') return Response.json({ ready: true });
    if (path === '/api/usage') return Response.json(snapshot);
    if (mode === 'network') throw new TypeError('Simulated connection failure');
    if (mode === 'timeout') throw Object.assign(new Error('Simulated timeout'), { name: 'AbortError' });
    if (mode === 'quota') return Response.json({ error: { code: 'daily_quota_exceeded', message: 'Daily course limit reached.' } }, { status: 429 });
    if (mode === 'provider') return Response.json({ error: { code: 'ai_unavailable', message: 'Generation failed.' } }, { status: 502 });
    if (path.endsWith('/audio')) return new Response('fake-mp3', { headers: { 'content-type': 'audio/mpeg' } });
    return Response.json({ _id: 'test-course' }, { status: 201 });
  };
  const unsubscribe = subscribeToGeneration(() => { notifications += 1; });
  try {
    assert.equal((await api.get('/api/usage')).quota.courses.remaining, 1);
    assert.equal(notifications, 0);
    await api.post('/api/courses/generate', { prompt: 'Test' });
    assert.equal(notifications, 1);
    const blob = await api.postBlob('/api/lessons/test/audio');
    assert.equal(await blob.text(), 'fake-mp3');
    assert.equal(notifications, 2);
    for (const [index, failure] of ['quota', 'provider', 'network', 'timeout'].entries()) {
      mode = failure;
      await assert.rejects(api.post('/api/courses/generate', { prompt: 'Test' }));
      assert.equal(notifications, index + 3);
    }
    // Token failures happen before fetch but still invalidate the display.
    const fetches = requests.length;
    setTokenSource(async () => { throw new Error('Expired token'); });
    await assert.rejects(api.post('/api/courses/generate', {}), /Expired token/);
    assert.equal(requests.length, fetches);
    assert.equal(notifications, 7);
    setTokenSource(null);
    mode = 'ok';
    const throwingListener = subscribeToGeneration(() => { throw new Error('Broken display'); });
    assert.equal((await api.post('/api/courses/generate', {}))._id, 'test-course');
    throwingListener();
    assert.equal(notifications, 8);
    console.log('PASS: Success, binary audio, failures, timeouts, and token errors invalidate usage; reads/session setup do not.');
    console.log('PASS: An allowance-display error cannot change the generation result.');

    const store = createUsageStore();
    assert.equal(store.getSnapshot().data, null); // Unknown is not zero.
    await store.refresh();
    assert.equal(store.getSnapshot().data.quota.courses.remaining, 1);
    snapshot = usage(0);
    const unsubscribeRefresh = subscribeToGeneration(store.refresh);
    await api.post('/api/courses/generate', {});
    await store.refresh();
    assert.equal(store.getSnapshot().data.quota.courses.remaining, 0);
    unsubscribeRefresh();
    console.log('PASS: A completed generation re-reads server counters rather than guessing a local increment.');

    const first = deferred();
    let loads = 0;
    const racingStore = createUsageStore({ load: () => {
      loads += 1;
      return loads === 1 ? first.promise : Promise.resolve(usage(0));
    } });
    const publishedRemaining = [];
    const stop = racingStore.subscribe(() => {
      const data = racingStore.getSnapshot().data;
      if (data) publishedRemaining.push(data.quota.courses.remaining);
    });
    const read = racingStore.refresh();
    await Promise.resolve();
    racingStore.refresh(); // Generation finishes while the first read is old.
    racingStore.refresh();
    first.resolve(usage(1));
    await read;
    stop();
    assert.equal(loads, 2);
    assert.deepEqual(publishedRemaining, [0]);
    console.log('PASS: Refreshes during an older read coalesce into one fresh read and never publish stale counts.');

    const oldRead = deferred();
    const oldAccount = createUsageStore({ load: () => oldRead.promise });
    const newAccount = createUsageStore({ load: async () => usage(0) });
    const oldPending = oldAccount.refresh();
    assert.equal(newAccount.getSnapshot().data, null);
    await newAccount.refresh();
    oldRead.resolve(usage(1));
    await oldPending;
    assert.equal(newAccount.getSnapshot().data.quota.courses.remaining, 0);
    console.log('PASS: Late reads from a discarded account cannot replace the current account’s allowance.');

    let fail = false;
    const recovering = createUsageStore({ load: async () => {
      if (fail) throw new Error('Usage temporarily unavailable');
      return usage(1);
    } });
    await recovering.refresh();
    fail = true;
    await recovering.refresh();
    assert.equal(recovering.getSnapshot().data.quota.courses.remaining, 1);
    assert.match(recovering.getSnapshot().error.message, /unavailable/);
    assert.equal(recovering.getSnapshot().pending, false);
    fail = false;
    await recovering.refresh();
    assert.equal(recovering.getSnapshot().error, null);
    console.log('PASS: Refresh failure preserves last-known counts with an error; retry restores a healthy display.');
  } finally {
    unsubscribe();
    setTokenSource(null);
    globalThis.fetch = originalFetch;
  }
}

verify().catch((err) => {
  console.error('FAIL:', err);
  process.exitCode = 1;
});
