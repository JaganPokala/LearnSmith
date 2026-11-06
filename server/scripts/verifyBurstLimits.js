import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createBurstLimiters } from '../middlewares/burstLimits.js';

async function verify() {
  // Small limits make the tests fast. No MongoDB or provider is involved.
  const { sessionLimiter, generationLimiter, learningWriteLimiter } = createBurstLimiters({
    windowMs: 60_000, sessionsPerIp: 2, generationRequestsPerIdentity: 2, learningWritesPerIdentity: 2,
  });
  const app = express();
  app.use(express.json());

  let owner = 'guest:test-a';
  let cookiesIssued = 0;
  let quotaCalls = 0;
  let generatorCalls = 0;

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.post('/api/session', sessionLimiter, (req, res) => {
    cookiesIssued += 1;
    res.cookie('test-guest', String(cookiesIssued), { httpOnly: true });
    res.json({ ready: true });
  });

  // Test-only stand-in for trusted identity middleware. The production
  // limiter never accepts an owner from a body, query, or custom header.
  app.use((req, res, next) => {
    if (req.path !== '/test/missing-identity') req.creator = owner;
    next();
  });

  function generate(req, res) {
    if (req.params.id === 'cached') return res.json({ cached: true });
    quotaCalls += 1;
    generatorCalls += 1;
    return res.status(201).json({ generated: true });
  }

  app.post('/api/courses/generate', generationLimiter, generate);
  app.post('/api/lessons/:id/generate', generationLimiter, generate);
  app.post('/api/lessons/:id/audio', generationLimiter, generate);
  app.get('/api/lessons/:id', (req, res) => res.json({ readable: true }));
  app.post('/api/lessons/:id/visit', learningWriteLimiter, (req, res) => res.json({ saved: true }));
  app.put('/api/lessons/:id/progress', learningWriteLimiter, (req, res) => res.json({ saved: true }));
  app.post('/api/lessons/:id/quiz-attempts', learningWriteLimiter, (req, res) => res.json({ saved: true }));
  app.post('/test/missing-identity', generationLimiter, generate);
  app.use((err, req, res, next) => {
    res.status(500).json({ error: { message: err.message } });
  });

  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { method = 'POST', body } = {}) {
      const response = await fetch(`${base}${path}`, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(5000),
      });
      return { status: response.status, headers: response.headers, body: await response.json() };
    }

    assert.equal((await request('/api/session')).status, 200);
    assert.equal((await request('/api/session')).status, 200);
    const blockedSession = await request('/api/session');
    assert.equal(blockedSession.status, 429);
    assert.equal(blockedSession.body.error.code, 'burst_limit_exceeded');
    assert.equal(blockedSession.headers.get('set-cookie'), null);
    assert.equal(cookiesIssued, 2);
    assert.ok(Number(blockedSession.headers.get('retry-after')) >= 1);
    console.log('PASS: Session bursts are blocked before another cookie can be issued.');

    assert.equal((await request('/api/lessons/example/visit')).status, 200);
    assert.equal((await request('/api/lessons/example/progress', { method: 'PUT' })).status, 200);
    assert.equal((await request('/api/lessons/example/quiz-attempts')).status, 429);
    assert.equal(quotaCalls, 0);
    assert.equal(generatorCalls, 0);
    console.log('PASS: Learning writes share their own identity bucket without consuming generation admission or quota.');

    assert.equal((await request('/api/courses/generate')).status, 201);
    assert.equal((await request('/api/lessons/example/generate')).status, 201);
    const blockedAudio = await request('/api/lessons/example/audio');
    assert.equal(blockedAudio.status, 429);
    assert.equal(blockedAudio.body.error.code, 'burst_limit_exceeded');
    assert.equal(quotaCalls, 2);
    assert.equal(generatorCalls, 2);
    assert.ok(blockedAudio.headers.get('ratelimit'));
    assert.ok(blockedAudio.headers.get('ratelimit-policy'));
    assert.equal(blockedAudio.headers.get('cache-control'), 'private, no-store');
    assert.ok(blockedAudio.body.error.retryAfterSeconds >= 1);
    console.log('PASS: Course, lesson, and audio POSTs share a bucket; blocked requests reach neither quota nor AI.');

    owner = 'user:test-b';
    assert.equal((await request('/api/courses/generate')).status, 201);
    const cached = await request('/api/lessons/cached/generate');
    assert.equal(cached.status, 200);
    assert.equal(cached.body.cached, true);
    assert.equal(quotaCalls, 3);
    assert.equal(generatorCalls, 3);
    assert.equal((await request('/api/lessons/example/audio')).status, 429);
    console.log('PASS: Identities have separate buckets; cached POSTs count toward bursts but not generation quota.');

    owner = 'guest:test-a';
    const spoofed = await request('/api/courses/generate', { body: { creator: 'user:forged' } });
    assert.equal(spoofed.status, 429);
    assert.equal(generatorCalls, 3);
    console.log('PASS: A supplied creator cannot reset the middleware-established identity limit.');

    owner = 'guest:test-c';
    const concurrent = await Promise.all(
      Array.from({ length: 12 }, () => request('/api/courses/generate')),
    );
    assert.equal(concurrent.filter((result) => result.status === 201).length, 2);
    assert.equal(concurrent.filter((result) => result.status === 429).length, 10);
    assert.equal(generatorCalls, 5);
    assert.equal(quotaCalls, 5);
    console.log('PASS: Twelve concurrent requests admit only the configured two.');

    assert.equal((await request('/api/health', { method: 'GET' })).status, 200);
    assert.equal((await request('/api/lessons/example', { method: 'GET' })).status, 200);
    console.log('PASS: Burst-blocked users can still read lessons; health checks remain available.');

    const missing = await request('/test/missing-identity');
    assert.equal(missing.status, 500);
    assert.match(missing.body.error.message, /Identity middleware/);
    assert.equal(generatorCalls, 5);

    await generationLimiter.resetKey(owner);
    assert.equal((await request('/api/courses/generate')).status, 201);
    assert.equal(generatorCalls, 6);
    console.log('PASS: Missing identity fails closed; clearing a bucket restores admission.');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
  }
}

verify().catch((err) => {
  console.error('FAIL:', err);
  process.exitCode = 1;
});
