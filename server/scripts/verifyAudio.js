import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import mongoose from 'mongoose';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import { LessonAudio } from '../models/LessonAudio.js';
import DailyUsage from '../models/DailyUsage.js';
import GenerationCall from '../models/GenerationCall.js';
import { createGenerateLessonAudioContent, getLessonAudio } from '../controllers/lessonController.js';
import { getUsage } from '../controllers/usageController.js';
import { createLessonAudioGenerator, prepareNarration } from '../services/audio.js';
import { createTextGenerator, createSpeechSynthesizer } from '../services/openai.js';
import { createGenerationTracker } from '../services/generationTracking.js';
import { consumeDailyQuota } from '../services/usageService.js';
import {
  claimAudioGeneration, renewAudioGeneration, completeAudioGeneration,
  failAudioGeneration, findReadyAudio,
} from '../services/audioGenerationState.js';
import { chunkForSpeech } from '../services/narration.js';
import { AUDIO_LIMITS } from '../config/audioLimits.js';

const OWNER = `audio-test:${randomUUID()}`;
const QUOTA_OWNER = `audio-test:${randomUUID()}`;
const courseId = new mongoose.Types.ObjectId();
const ids = [];
const prose = 'A database claim lets only one request generate narration for a lesson. '.repeat(5);
const translated = 'Yeh lesson database claims ko explain karta hai. '.repeat(125);
const bytes = Buffer.from('fake-mp3');
let actor = OWNER;
let enabled = true;
let translations = 0;
let speechCalls = 0;
let mode = 'ok';
let onTranslation = null;
let releaseTranslation = null;

function response(content = translated, finishReason = 'stop') {
  return {
    id: randomUUID(), model: 'gpt-4.1-mini', service_tier: 'default',
    usage: {
      prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens: 200,
    },
    choices: [{ finish_reason: finishReason, message: { content } }],
  };
}

async function fixture(fields = {}) {
  const id = new mongoose.Types.ObjectId();
  ids.push(id);
  return Lesson.create({
    _id: id, title: 'Audio protection', course: courseId, module: new mongoose.Types.ObjectId(),
    isEnriched: true, content: [{ type: 'paragraph', text: prose }], ...fields,
  });
}

async function verify() {
  // Pure bounds: preserve words and split even one oversized word.
  for (const text of ['word '.repeat(2000), 'x'.repeat(10_000), 'Sentence. '.repeat(600)]) {
    const chunks = chunkForSpeech(text, 4096);
    assert.ok(chunks.every((chunk) => chunk.length > 0 && chunk.length <= 4096));
    assert.equal(chunks.join(' ').replace(/\s/g, ''), text.replace(/\s/g, ''));
  }
  assert.throws(() => prepareNarration({ content: [{ type: 'paragraph', text: 'x'.repeat(12_001) }] }), { code: 'audio_too_long' });
  console.log('PASS: Narration bounds and long-sentence splitting preserve content.');

  assert.ok(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI first.');
  await mongoose.connect(process.env.TEST_MONGO_URI, {
    dbName: 'learnsmith_generation_test', serverSelectionTimeoutMS: 8000,
  });
  let server;
  try {
    await Course.create({ _id: courseId, title: 'Audio verification', creator: OWNER });
    const tracker = createGenerationTracker();
    const translate = createTextGenerator({ tracker, complete: async () => {
      translations += 1;
      if (onTranslation) {
        onTranslation();
        await releaseTranslation;
      }
      if (mode === 'truncated') return response('Incomplete', 'length');
      if (mode === 'oversized') return response('x'.repeat(12_001));
      return response();
    } });
    const speak = createSpeechSynthesizer({ tracker, synthesize: async (body) => {
      speechCalls += 1;
      assert.ok(body.input.length <= AUDIO_LIMITS.chunkChars);
      assert.equal(body.response_format, 'mp3');
      if (mode === 'speech-failure' && speechCalls % 2 === 0) throw new Error('Fake upstream timeout');
      return new Response(bytes, { headers: { 'x-request-id': `fake-${speechCalls}` } });
    } });
    const generate = createLessonAudioGenerator({ translate, speak, tracker });
    const handler = createGenerateLessonAudioContent({ generate, ttsEnabled: () => enabled });
    const app = express();
    // Test-only trusted identity; the production application verifies cookies/JWTs.
    app.use((req, res, next) => { req.creator = actor; req.identityType = 'user'; next(); });
    app.post('/lessons/:id/audio', handler);
    app.get('/lessons/:id/audio', getLessonAudio);
    app.get('/usage', getUsage);
    app.use((err, req, res, next) => {
      if (res.headersSent) return next(err);
      res.status(err.statusCode ?? 500).json({ error: { code: err.code, message: err.message } });
    });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (lesson, method = 'POST') => {
      const res = await fetch(`${base}/lessons/${lesson._id}/audio`, { method, signal: AbortSignal.timeout(10_000) });
      return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
    };
    const used = async () => (await DailyUsage.findOne({ creator: OWNER }).lean())?.audio ?? 0;

    const lesson = await fixture();
    let started;
    const translationStarted = new Promise((resolve) => { started = resolve; });
    onTranslation = started;
    let release;
    releaseTranslation = new Promise((resolve) => { release = resolve; });
    const first = request(lesson);
    try {
      await Promise.race([translationStarted, new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Generator did not start')), 8000);
        timer.unref();
      })]);
      const duplicates = await Promise.all(Array.from({ length: 5 }, () => request(lesson)));
      assert.ok(duplicates.every((res) => res.status === 409 && res.body.error.code === 'audio_generation_in_progress'));
      assert.equal(translations, 1);
      assert.equal(speechCalls, 0);
      assert.equal(await used(), 1);
      assert.equal((await request(lesson, 'GET')).status, 404);
    } finally { release(); }
    assert.equal((await first).status, 201);
    onTranslation = null;
    assert.equal(speechCalls, 2);
    assert.equal(await LessonAudio.countDocuments({ lesson: lesson._id }), 1);
    const audio = await findReadyAudio(lesson._id);
    assert.deepEqual(Buffer.from(audio.mp3), Buffer.concat([bytes, bytes]));
    const calls = await GenerationCall.find({ creator: OWNER }).sort({ attemptNumber: 1 }).lean();
    assert.deepEqual(calls.map((row) => row.operation), ['audio_translation', 'audio_speech', 'audio_speech']);
    assert.deepEqual(calls.map((row) => row.attemptNumber), [1, 2, 3]);
    assert.equal(calls[0].estimatedCostUsd, 0.00036);
    assert.ok(calls.slice(1).every((row) => row.costStatus === 'missing_usage' && row.estimatedCostUsd === null && row.providerRequestId));
    enabled = false;
    assert.equal((await request(lesson)).status, 200);
    assert.equal((await request(lesson, 'GET')).status, 200);
    enabled = true;
    assert.equal(await used(), 1);
    assert.equal(translations, 1);
    console.log('PASS: Concurrent requests start one paid job; cached playback uses no quota or provider calls.');
    console.log('PASS: Translation and each speech chunk have separate records; unavailable speech cost stays unknown.');

    actor = 'audio-test:foreign';
    assert.equal((await request(lesson)).status, 404);
    assert.equal((await request(lesson, 'GET')).status, 404);
    actor = OWNER;
    const unwritten = await fixture({ isEnriched: false, title: 'Long title '.repeat(20) });
    assert.equal((await request(unwritten)).body.error.code, 'nothing_to_narrate');
    const oversized = await fixture({ content: [{ type: 'paragraph', text: 'x'.repeat(12_001) }] });
    assert.equal((await request(oversized)).body.error.code, 'audio_too_long');
    assert.equal(await used(), 1);
    console.log('PASS: Ownership, unwritten lessons, and oversized input reject before quota or AI.');

    const failed = await fixture();
    mode = 'speech-failure';
    assert.equal((await request(failed)).status, 502);
    assert.equal(await findReadyAudio(failed._id), null);
    assert.equal((await LessonAudio.findOne({ lesson: failed._id })).generationStatus, 'failed');
    assert.equal(await used(), 2);
    assert.equal(await GenerationCall.countDocuments({ creator: OWNER, outcome: 'unknown' }), 1);
    mode = 'ok';
    assert.equal((await request(failed)).status, 201);
    assert.equal(await used(), 3);
    console.log('PASS: Partial speech failure stays billed/unknown in accounting; a later retry can acquire a new claim.');

    for (const badMode of ['truncated', 'oversized']) {
      mode = badMode;
      const invalid = await fixture();
      const before = speechCalls;
      assert.equal((await request(invalid)).status, 502);
      assert.equal(speechCalls, before);
      assert.equal(await findReadyAudio(invalid._id), null);
    }
    mode = 'ok';
    assert.equal(await GenerationCall.countDocuments({ creator: OWNER, operation: 'audio_translation', validationStatus: 'rejected' }), 2);
    console.log('PASS: Truncated/oversized translation is recorded but never reaches speech synthesis.');

    // Force expiry; real time sleeps would make this test slow and unreliable.
    const stale = await fixture();
    const old = await claimAudioGeneration(stale._id);
    await LessonAudio.updateOne({ lesson: stale._id }, { $set: { generationLeaseExpiresAt: new Date(0) } });
    const oldContext = { lessonId: stale._id, attemptId: old.attemptId };
    assert.equal(await renewAudioGeneration(oldContext), false);
    assert.equal(await completeAudioGeneration({ ...oldContext, bytes, chars: 10 }), null);
    const current = await claimAudioGeneration(stale._id);
    assert.ok(current && current.attemptId !== old.attemptId);
    await failAudioGeneration(oldContext);
    assert.equal((await LessonAudio.findOne({ lesson: stale._id })).generationAttemptId, current.attemptId);
    assert.equal(await completeAudioGeneration({ ...oldContext, bytes, chars: 10 }), null);
    assert.equal(await renewAudioGeneration({ lessonId: stale._id, attemptId: current.attemptId }), true);
    assert.ok(await completeAudioGeneration({ lessonId: stale._id, attemptId: current.attemptId, bytes, chars: 10 }));
    assert.equal(await claimAudioGeneration(stale._id), null);

    let stage = 0;
    let paidChunks = 0;
    const lost = createLessonAudioGenerator({
      tracker: { validation: async () => {} },
      translate: async () => ({ text: translated }),
      speak: async () => { paidChunks += 1; return { bytes }; },
    });
    await assert.rejects(lost(lesson, { beforeProviderCall: async () => {
      stage += 1;
      if (stage === 3) throw new Error('Lost claim');
    } }), /Lost claim/);
    assert.equal(paidChunks, 1);
    console.log('PASS: Expired attempts cannot renew, publish, or clear the new owner; a lost claim stops the next speech chunk.');

    // Existing records from before the audio field was introduced still work.
    const day = new Date().toISOString().slice(0, 10);
    await DailyUsage.collection.insertOne({ creator: QUOTA_OWNER, day, courses: 0, lessons: 0 });
    const admissions = await Promise.allSettled(Array.from({ length: 8 }, () => consumeDailyQuota({
      creator: QUOTA_OWNER, identityType: 'guest', resource: 'audio',
    })));
    assert.equal(admissions.filter((result) => result.status === 'fulfilled').length, 2);
    assert.ok(admissions.filter((result) => result.status === 'rejected').every((result) => result.reason.code === 'daily_quota_exceeded'));
    await DailyUsage.updateOne({ creator: OWNER, day }, { $set: { audio: 10 } });
    const blocked = await fixture();
    const before = translations;
    assert.equal((await request(blocked)).status, 429);
    assert.equal(translations, before);
    assert.equal((await LessonAudio.findOne({ lesson: blocked._id })).generationStatus, 'failed');
    assert.equal((await request(lesson)).status, 200);
    console.log('PASS: Daily audio quotas are atomic, support older records, release rejected claims, and allow cached playback.');

    const report = await (await fetch(`${base}/usage`)).json();
    const ownerCalls = await GenerationCall.find({ creator: OWNER }).lean();
    assert.equal(report.generation.calls, 0);
    assert.equal(report.audio.calls, ownerCalls.length);
    assert.equal(report.audio.estimatedCostUsd, null);
    assert.equal(report.audio.costStatus, 'partial');
    assert.equal(report.audio.knownOutputBytes, ownerCalls.reduce((sum, row) => sum + (row.outputBytes ?? 0), 0));
    assert.equal(report.quota.audio.remaining, 0);
    actor = QUOTA_OWNER;
    const otherReport = await (await fetch(`${base}/usage`)).json();
    assert.equal(otherReport.audio.calls, 0);
    actor = OWNER;

    let providerCalls = 0;
    const unavailable = createGenerationTracker({ CallModel: { init: async () => { throw new Error('DB down'); } } });
    const noSpend = createSpeechSynthesizer({ tracker: unavailable, synthesize: async () => { providerCalls += 1; } });
    await assert.rejects(noSpend({ text: 'Test', tracking: {
      creator: OWNER, generationId: randomUUID(), operation: 'audio_speech', attemptNumber: 1,
    } }), { code: 'tracking_unavailable' });
    assert.equal(providerCalls, 0);
    console.log('PASS: Usage separates audio from lesson text and isolates owners; accounting outage prevents new speech spend.');

    // Binary-body failure happens after response headers; it must still leave
    // a record, with an unknown billed outcome rather than a zero cost.
    const interruptedId = randomUUID();
    const interrupted = createSpeechSynthesizer({ tracker, synthesize: async () => ({
      arrayBuffer: async () => { throw new Error('Connection closed during MP3 download'); },
    }) });
    await assert.rejects(interrupted({ text: 'Test speech', tracking: {
      creator: OWNER, generationId: interruptedId, operation: 'audio_speech', attemptNumber: 1,
    } }), { code: 'tts_unavailable' });
    const interruptedRow = await GenerationCall.findOne({ generationId: interruptedId });
    assert.equal(interruptedRow.outcome, 'unknown');
    assert.equal(interruptedRow.estimatedCostUsd, null);

    const logs = [];
    const brokenWrites = createGenerationTracker({
      CallModel: {
        init: () => GenerationCall.init(), create: (fields) => GenerationCall.create(fields),
        updateOne: async () => { throw new Error('Accounting update unavailable'); },
      },
      logError: (...args) => logs.push(args),
    });
    const paidId = randomUUID();
    const paid = createSpeechSynthesizer({ tracker: brokenWrites, synthesize: async () => {
      providerCalls += 1;
      return new Response(bytes);
    } });
    assert.deepEqual((await paid({ text: 'Test speech', tracking: {
      creator: OWNER, generationId: paidId, operation: 'audio_speech', attemptNumber: 1,
    } })).bytes, bytes);
    assert.equal(providerCalls, 1);
    assert.equal((await GenerationCall.findOne({ generationId: paidId })).outcome, 'unknown');
    assert.ok(logs.some(([event]) => event === 'generation_accounting_write_failed'));
    console.log('PASS: Interrupted binary downloads remain unknown; post-response accounting failure preserves audio without retrying speech.');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    try {
      await LessonAudio.deleteMany({ lesson: { $in: ids } });
      await Lesson.deleteMany({ _id: { $in: ids } });
      await Course.deleteOne({ _id: courseId });
      await DailyUsage.deleteMany({ creator: { $in: [OWNER, QUOTA_OWNER] } });
      await GenerationCall.deleteMany({ creator: OWNER });
    } finally { await mongoose.disconnect(); }
  }
}

verify().catch((err) => {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
});
