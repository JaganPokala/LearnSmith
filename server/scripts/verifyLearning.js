import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Course from '../models/Course.js';
import Module from '../models/Module.js';
import Lesson from '../models/Lesson.js';
import LessonProgress from '../models/LessonProgress.js';
import QuizAttempt from '../models/QuizAttempt.js';
import DailyUsage from '../models/DailyUsage.js';
import GenerationCall from '../models/GenerationCall.js';
import lessonsRouter from '../routes/lessons.js';
import coursesRouter from '../routes/courses.js';
import { errorHandler } from '../middlewares/errorHandler.js';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
const prefix = `learning-test:${randomUUID()}`;
const owners = [`${prefix}:user`, `${prefix}:other`, `${prefix}:guest`];
const courseIds = [];
const question = { type: 'mcq', question: 'Who decides whether this answer is correct?',
  options: ['The browser-supplied score', 'The saved server question'], answer: 1,
  explanation: 'The server compares the chosen option with its stored answer.' };

async function fixture(creator) {
  const course = new mongoose.Types.ObjectId();
  const module = new mongoose.Types.ObjectId();
  const written = new mongoose.Types.ObjectId();
  const unwritten = new mongoose.Types.ObjectId();
  courseIds.push(course);
  await Course.create({ _id: course, creator, title: 'Learning test', modules: [module] });
  await Module.create({ _id: module, course, title: 'Module', lessons: [written, unwritten] });
  await Lesson.create([
    { _id: written, course, module, title: 'Written lesson', isEnriched: true,
      content: [{ type: 'heading', text: 'Written lesson' }, question, { ...question, question: 'Second question?' }] },
    { _id: unwritten, course, module, title: 'Unwritten lesson' },
  ]);
  return { course, written, unwritten };
}

async function verify() {
  assert.ok(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI first.');
  let server;
  try {
    await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'learnsmith_generation_test', serverSelectionTimeoutMS: 8000 });
    await Promise.all([LessonProgress.init(), QuizAttempt.init()]);
    const own = await fixture(owners[0]);
    const foreign = await fixture(owners[1]);
    const guest = await fixture(owners[2]);
    const app = express();
    app.use(express.json());
    // Test-only identity injection. Production uses the verified JWT/cookie middleware.
    app.use((req, res, next) => {
      req.creator = req.get('X-Test-Owner') ?? owners[0];
      req.identityType = req.creator === owners[2] ? 'guest' : 'user';
      next();
    });
    app.use('/api/lessons', lessonsRouter);
    app.use('/api/courses', coursesRouter);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function send(method, path, body, owner = owners[0]) {
      const response = await fetch(`${base}${path}`, { method,
        headers: { 'X-Test-Owner': owner, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      return { status: response.status, headers: response.headers, body: await response.json() };
    }
    const learningPath = `/lessons/${own.written}/learning`;
    const initial = await send('GET', learningPath);
    assert.equal(initial.status, 200);
    assert.match(initial.headers.get('cache-control'), /private, no-store/);
    assert.equal(initial.body.progress.completed, false);
    assert.equal(await LessonProgress.countDocuments({ creator: owners[0] }), 0, 'GET must not create activity.');
    assert.deepEqual(initial.body.questions.map((item) => item.questionIndex), [1, 2]);
    for (const [method, suffix, body] of [
      ['GET', 'learning'], ['POST', 'visit', {}], ['PUT', 'progress', { completed: true }],
      ['POST', 'quiz-attempts', {}],
    ]) {
      assert.equal((await send(method, `/lessons/${foreign.written}/${suffix}`, body)).status, 404);
    }
    assert.equal((await send('GET', `/courses/${foreign.course}/progress`)).status, 404);
    assert.equal((await send('GET', '/lessons/not-an-id/learning')).status, 400);
    assert.equal((await send('GET', `${learningPath}?before=bad`)).status, 400);
    assert.equal((await send('PUT', `/lessons/${own.written}/progress`, { completed: 'true' })).status, 400);
    assert.equal((await send('PUT', `/lessons/${own.unwritten}/progress`, { completed: true })).status, 409);
    console.log('PASS: Private reads create no activity; foreign ownership, malformed input, and unwritten completion are rejected.');

    const completions = await Promise.all(Array.from({ length: 5 }, () =>
      send('PUT', `/lessons/${own.written}/progress`, { completed: true })));
    assert.ok(completions.every((item) => item.status === 200));
    const completedAt = completions[0].body.progress.completedAt;
    assert.ok(completedAt);
    assert.ok(completions.every((item) => item.body.progress.completedAt === completedAt));
    assert.equal(await LessonProgress.countDocuments({ creator: owners[0], lesson: own.written }), 1);
    await send('POST', `/lessons/${own.written}/visit`, {});
    const visit = await send('POST', `/lessons/${own.unwritten}/visit`, {});
    assert.ok(visit.body.progress.lastOpenedAt);
    let progress = await send('GET', `/courses/${own.course}/progress`);
    assert.equal(progress.body.completedLessons, 1);
    assert.equal(progress.body.totalLessons, 2);
    assert.equal(progress.body.percent, 50);
    assert.equal(progress.body.resumeLesson.id, String(own.unwritten));
    assert.deepEqual(progress.body.completedLessonIds, [String(own.written)]);
    await send('PUT', `/lessons/${own.written}/progress`, { completed: false });
    progress = await send('GET', `/courses/${own.course}/progress`);
    assert.equal(progress.body.completedLessons, 0);
    assert.equal((await send('GET', learningPath)).body.progress.completedAt, null);
    console.log('PASS: Concurrent completion produces one record and timestamp; undo and last-opened resume survive fresh reads.');

    const payload = { submissionId: randomUUID(), questionIndex: 1,
      questionVersion: initial.body.questions[0].version, selectedOption: 0,
      isCorrect: true, correctOption: 0, creator: owners[1], score: 100 };
    const answerPath = `/lessons/${own.written}/quiz-attempts`;
    const results = await Promise.all(Array.from({ length: 5 }, () => send('POST', answerPath, payload)));
    assert.equal(results.filter((item) => item.status === 201).length, 1);
    assert.equal(results.filter((item) => item.status === 200).length, 4);
    assert.ok(results.every((item) => item.body.attempt.isCorrect === false && item.body.attempt.correctOption === 1));
    assert.equal(new Set(results.map((item) => item.body.attempt.id)).size, 1);
    assert.equal(await QuizAttempt.countDocuments({ creator: owners[0] }), 1);
    assert.equal(await QuizAttempt.countDocuments({ creator: owners[1] }), 0);
    assert.equal((await send('POST', answerPath, { ...payload, selectedOption: 1 })).status, 409);
    for (const patch of [{ selectedOption: 9 }, { selectedOption: -1 }, { questionIndex: 0 },
      { questionIndex: 1.2 }, { questionVersion: '0'.repeat(64) }, { submissionId: [randomUUID()] }]) {
      const response = await send('POST', answerPath, { ...payload, submissionId: randomUUID(), ...patch });
      assert.ok([400, 409].includes(response.status));
    }
    assert.equal((await send('POST', `/lessons/${own.unwritten}/quiz-attempts`, { ...payload, submissionId: randomUUID() })).status, 409);
    const retake = await send('POST', answerPath, { ...payload, submissionId: randomUUID(), selectedOption: 1 });
    assert.equal(retake.status, 201);
    assert.equal(retake.body.attempt.isCorrect, true);
    let activity = (await send('GET', learningPath)).body;
    assert.equal(activity.questions[0].attemptCount, 2);
    assert.equal(activity.questions[0].latestAttempt.id, retake.body.attempt.id);
    assert.equal(activity.questions[1].attemptCount, 0);
    assert.equal(activity.progress.completed, false, 'Quiz correctness must not change manual completion.');
    console.log('PASS: Server grading ignores forged scores; concurrent/retried submission IDs save once; retakes retain both results.');

    for (let index = 0; index < 21; index += 1) {
      assert.equal((await send('POST', answerPath, { ...payload, submissionId: randomUUID(), selectedOption: index % 2 })).status, 201);
    }
    activity = (await send('GET', learningPath)).body;
    assert.equal(activity.attempts.length, 20);
    assert.ok(activity.nextCursor);
    const older = (await send('GET', `${learningPath}?before=${activity.nextCursor}`)).body;
    assert.equal(older.attempts.length, 3);
    assert.equal(older.nextCursor, null);
    assert.equal(new Set([...activity.attempts, ...older.attempts].map((item) => item.id)).size, 23);
    const changed = { ...question, question: 'A changed question', answer: 0, explanation: 'The current answer changed.' };
    await Lesson.updateOne({ _id: own.written }, { $set: { content: [{ type: 'heading', text: 'Written lesson' }, changed, question] } });
    assert.equal((await send('POST', answerPath, { ...payload, submissionId: randomUUID() })).body.error.code, 'quiz_changed');
    const replay = await send('POST', answerPath, payload);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.attempt.question, question.question);
    activity = (await send('GET', learningPath)).body;
    assert.equal(activity.questions[0].attemptCount, 0);
    assert.equal(activity.attempts[0].explanation, question.explanation);
    console.log('PASS: Cursor pages do not overlap; changed question versions reject stale answers and preserve historical snapshots.');

    const guestLearning = await send('GET', `/lessons/${guest.written}/learning`, undefined, owners[2]);
    const guestPayload = { submissionId: randomUUID(), questionIndex: 1,
      questionVersion: guestLearning.body.questions[0].version, selectedOption: 1 };
    assert.equal((await send('POST', `/lessons/${guest.written}/visit`, {}, owners[2])).status, 200);
    assert.equal((await send('PUT', `/lessons/${guest.written}/progress`, { completed: true }, owners[2])).status, 200);
    assert.equal((await send('POST', `/lessons/${guest.written}/quiz-attempts`, guestPayload, owners[2])).status, 201);
    assert.equal((await send('GET', `/lessons/${guest.written}/learning`)).status, 404);
    assert.equal((await send('GET', `/courses/${guest.course}/progress`, undefined, owners[2])).body.completedLessons, 1);

    await send('PUT', `/lessons/${own.written}/progress`, { completed: true });
    const listed = await send('GET', '/courses');
    const row = listed.body.courses.find((item) => item._id === String(own.course));
    assert.equal(row.completedLessonCount, 1);
    assert.equal(row.resumeLessonId, String(own.unwritten));
    assert.equal(listed.body.totals.completed, 1);
    assert.equal(await DailyUsage.countDocuments({ creator: { $in: owners } }), 0);
    assert.equal(await GenerationCall.countDocuments({ creator: { $in: owners } }), 0);
    assert.equal((await send('DELETE', `/courses/${own.course}`)).status, 200);
    assert.equal(await LessonProgress.countDocuments({ course: own.course }), 0);
    assert.equal(await QuizAttempt.countDocuments({ course: own.course }), 0);
    assert.equal((await send('GET', learningPath)).status, 404);
    console.log('PASS: Guest activity stays isolated; library summaries/resume and course deletion work without AI calls or daily usage.');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      await QuizAttempt.deleteMany({ creator: { $in: owners } });
      await LessonProgress.deleteMany({ creator: { $in: owners } });
      await Lesson.deleteMany({ course: { $in: courseIds } });
      await Module.deleteMany({ course: { $in: courseIds } });
      await Course.deleteMany({ _id: { $in: courseIds } });
    }
    await mongoose.disconnect();
  }
}

verify().catch((error) => { console.error('FAIL:', error); process.exitCode = 1; });
