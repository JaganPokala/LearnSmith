import assert from 'node:assert/strict';
import { watchLessonGeneration } from '../src/lib/watchLessonGeneration.js';

const active = { generation: { state: 'generating', retryAt: '2026-11-07T00:00:00Z' }, lesson: { _id: 'lesson-a', isEnriched: false } };
const ready = { generation: { state: 'ready', retryAt: null }, lesson: { _id: 'lesson-a', isEnriched: true, content: [{ type: 'paragraph', text: 'Saved content' }] } };
const expired = { generation: { state: 'retryable', retryAt: null }, lesson: { _id: 'lesson-a', isEnriched: false } };

async function verify() {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let sequence = [active, ready];
  let clock = 0;
  const updates = [];
  const timing = { now: () => clock, wait: async (ms) => { clock += ms; } };
  globalThis.fetch = async (path, options = {}) => {
    requests.push({ path, method: options.method ?? 'GET' });
    if (path === '/api/session') return Response.json({ ready: true });
    assert.equal(path, '/api/lessons/lesson-a/generation');
    assert.equal(options.method ?? 'GET', 'GET');
    return Response.json(sequence.shift());
  };
  try {
    const finished = await watchLessonGeneration({ lessonId: 'lesson-a', initial: active, onUpdate: (data) => updates.push(data), ...timing });
    assert.equal(finished.lesson.isEnriched, true);
    assert.equal(updates.length, 2);
    assert.equal(requests.filter((request) => request.path.endsWith('/generation')).length, 2);
    assert.equal(requests.filter((request) => request.path !== '/api/session' && request.method === 'POST').length, 0);
    console.log('PASS: A competing job becomes saved content through GET polling, with no generation POST.');

    sequence = [expired];
    const stopped = await watchLessonGeneration({ lessonId: 'lesson-a', initial: active, onUpdate: () => {}, ...timing });
    assert.equal(stopped.generation.state, 'retryable');
    assert.equal(stopped.lesson.isEnriched, false);
    const readCount = requests.length;
    for (const initial of [ready, expired, { ...expired, generation: { state: 'failed' } }]) {
      await watchLessonGeneration({ lessonId: 'lesson-a', initial, onUpdate: () => {}, ...timing });
    }
    assert.equal(requests.length, readCount);
    console.log('PASS: Expired/failed claims return control for an explicit retry; completed/idle states do not poll.');

    let reads = 0;
    await assert.rejects(watchLessonGeneration({ lessonId: 'lesson-a', initial: active,
      read: async () => { reads += 1; return active; }, onUpdate: () => {}, maxWaitMs: 5000, ...timing,
    }), { code: 'generation_status_unavailable' });
    assert.equal(reads, 2);
    console.log('PASS: A server that keeps reporting active cannot cause unlimited polling.');

    const beforeWait = new AbortController();
    const cancelled = watchLessonGeneration({ lessonId: 'lesson-a', initial: active, signal: beforeWait.signal,
      read: async () => { throw new Error('Must not read'); }, onUpdate: () => {},
    });
    beforeWait.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });

    const duringRead = new AbortController();
    let resolveRead;
    const pendingRead = new Promise((resolve) => { resolveRead = resolve; });
    let enteredRead;
    const entered = new Promise((resolve) => { enteredRead = resolve; });
    const lateUpdates = [];
    const watching = watchLessonGeneration({ lessonId: 'lesson-a', initial: active, signal: duringRead.signal,
      wait: async () => {}, read: async () => { enteredRead(); return pendingRead; }, onUpdate: (data) => lateUpdates.push(data),
    });
    await entered;
    duringRead.abort();
    resolveRead(ready);
    await assert.rejects(watching, { name: 'AbortError' });
    assert.equal(lateUpdates.length, 0);
    console.log('PASS: Navigation cancels checks, including results arriving after a lesson has been left.');

    await assert.rejects(watchLessonGeneration({ lessonId: 'lesson-a', initial: active, ...timing,
      read: async () => { throw new Error('Status service unavailable'); }, onUpdate: () => {},
    }), /Status service unavailable/);
    console.log('PASS: Status failures surface instead of silently continuing or starting another paid job.');
  } finally { globalThis.fetch = originalFetch; }
}

verify().catch((err) => { console.error('FAIL:', err); process.exitCode = 1; });
