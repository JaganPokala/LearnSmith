/**
 * Lazy lesson content: lessons are created as titles only and the body is
 * written the first time somebody opens one, then served from the database.
 *
 * A 5x4 course is 20 lessons at ~9-13s each — generating them all up front is
 * four minutes of spinner for lessons most users never open.
 */

import Lesson from '../models/Lesson.js';
import Module from '../models/Module.js';
import Course from '../models/Course.js';
import { generateLesson } from '../services/lessonGenerator.js';
import { creatorOf } from '../middlewares/auth.js';
import { resolveVideoBlocks } from '../services/youtube.js';
import { generateLessonAudio } from '../services/audio.js';
import { LessonAudio } from '../models/LessonAudio.js';
import { features } from '../config/env.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { trace } from '../middlewares/trace.js';

/**
 * Every course belongs to this one shared owner until Auth0 lands in Phase 8,
 * where it becomes req.auth.payload.sub. One library, shared by every visitor.
 */

/**
 * POST /api/lessons/:id/generate
 * First call generates (~9-13s) and saves; later calls return the copy (~70ms).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function generateLessonContent(req, res) {
  const startedAt = performance.now();

  // A malformed id throws CastError -> 400 invalid_id, handled centrally.
  const lesson = await Lesson.findById(req.params.id);

  if (!lesson) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  // OWNERSHIP, on the denormalised `course` field — one indexed lookup instead
  // of walking module -> course. The module is needed only for its title, which
  // is context for the generator, so both run in parallel.
  const [course, module] = await Promise.all([
    Course.findOne({ _id: lesson.course, creator: creatorOf(req) }),
    Module.findById(lesson.module),
  ]);

  // Same 404 for "no such lesson", "orphaned" and "not yours" — which one it
  // was is ours to debug, not the caller's to learn.
  if (!course || !module) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  // isEnriched, NOT content.length: a generation that legitimately produced
  // zero blocks would be retried forever by a length check.
  if (lesson.isEnriched) {
    trace(
      `  lesson: "${lesson.title}" cache hit, ${Math.round(performance.now() - startedAt)}ms, ${lesson.content.length} blocks`
    );

    return res.json(lesson);
  }

  // Course and module titles as well as the lesson's — without them the model
  // guesses, confidently, what level it is writing for.
  // Errors from here are already typed ApiErrors, so no catch.
  const { lesson: generated, ms } = await generateLesson({
    courseTitle: course.title,
    moduleTitle: module.title,
    lessonTitle: lesson.title,
  });

  // ASSIGN THE WHOLE ARRAY. Mongoose cannot see mutations inside a Mixed field,
  // so `lesson.content[0].text = 'x'` saves nothing and throws nothing.
  // isEnriched last, or a failed save leaves a lesson marked generated but empty.
  // Video queries become real video ids HERE, once, before the lesson is
  // stored — never on read. A search costs 100 of 10,000 daily quota units, so
  // resolving per view would spend the day's budget on repeat visits to the
  // same lesson. Resolved ids live in the block and every later read is free.
  //
  // Cannot throw: a lesson whose lookup failed keeps its query and renders the
  // search link, exactly as it does today.
  lesson.content = await resolveVideoBlocks(generated.content);
  lesson.objectives = generated.objectives;
  lesson.isEnriched = true;

  await lesson.save();

  // Block and mcq counts are what reveal lessons getting thinner as prompts change.
  const mcqCount = lesson.content.filter((block) => block.type === 'mcq').length;

  trace(
    `  lesson: "${lesson.title}" generated in ${ms}ms, total ${Math.round(performance.now() - startedAt)}ms, ${lesson.content.length} blocks, ${mcqCount} mcqs`
  );

  res.json(lesson);
}

/**
 * GET /api/lessons/:id — the lesson plus the context the page frames it with:
 * course and module for the breadcrumb, siblings for the rail, position/total.
 *
 * NEVER GENERATES. A read must be safe to repeat — a refresh or a link preview
 * would otherwise each trigger ~12s of billed generation. An unwritten lesson
 * comes back isEnriched:false and the client decides whether to POST.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getLesson(req, res) {
  const lesson = await Lesson.findById(req.params.id);

  if (!lesson) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  // The module is populated rather than queried because THE ARRAY ORDER IS THE
  // LESSON ORDER — Lesson.find({ module }) returns them in whatever order the
  // database felt like, and the rail would silently scramble.
  const [course, module] = await Promise.all([
    Course.findOne({ _id: lesson.course, creator: creatorOf(req) }).select('title'),
    Module.findById(lesson.module)
      .select('title lessons')
      .populate({ path: 'lessons', select: 'title isEnriched' }),
  ]);

  if (!course || !module) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  const siblings = module.lessons;
  const index = siblings.findIndex((s) => String(s._id) === String(lesson._id));

  trace(
    `  lesson: read "${lesson.title}" isEnriched=${lesson.isEnriched} blocks=${lesson.content.length}`
  );

  res.json({
    lesson,
    course: { _id: course._id, title: course.title },
    module: { _id: module._id, title: module.title },
    siblings,
    // -1 means the lesson is not listed in its own module's array — a broken
    // link the UI should not render a number for.
    position: index === -1 ? null : index + 1,
    total: siblings.length,
  });
}

/**
 * Load a lesson and prove the caller owns it, or throw.
 *
 * Ownership is checked through the denormalised `course` field (D31) with the
 * creator IN THE QUERY (D28) — a findById plus a check afterwards is a
 * different thing, and a worse one.
 *
 * @param {import('express').Request} req
 * @returns {Promise<object>} the Lesson document
 */
async function ownedLesson(req) {
  const lesson = await Lesson.findById(req.params.id);

  if (!lesson) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  const course = await Course.findOne({ _id: lesson.course, creator: creatorOf(req) }).select('_id');

  // 404, not 403: a lesson you may not read should be indistinguishable from
  // one that does not exist, or the response confirms it is there.
  if (!course) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  return lesson;
}

/**
 * GET /api/lessons/:id/audio — stream stored narration.
 *
 * NEVER GENERATES, for the same reason getLesson does not: a browser
 * revalidating, a prefetch or a link preview would each start a billed
 * synthesis. 404 means "not made yet", and the client POSTs.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getLessonAudio(req, res) {
  await ownedLesson(req);

  const audio = await LessonAudio.findOne({ lesson: req.params.id });

  if (!audio) {
    throw new ApiError(404, 'audio_not_found', 'This lesson has no narration yet.');
  }

  trace(`  audio: cache hit, ${Math.round(audio.mp3.length / 1024)}KB`);

  res.set('Content-Type', 'audio/mpeg');
  res.set('Content-Length', String(audio.mp3.length));
  // It is derived from a lesson that rarely changes, and it is expensive.
  res.set('Cache-Control', 'private, max-age=86400');

  res.send(audio.mp3);
}

/**
 * POST /api/lessons/:id/audio — generate the narration, then return it.
 *
 * Idempotent by storage: a second call returns the stored bytes rather than
 * paying twice.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function generateLessonAudioContent(req, res) {
  const startedAt = performance.now();

  if (!features.tts) {
    throw new ApiError(503, 'tts_unavailable', 'Audio narration is not configured on this server.');
  }

  const lesson = await ownedLesson(req);

  // The REAL signal, not a proxy for it. A character-count guard in audio.js
  // let an unwritten lesson through whenever its TITLE happened to be long
  // enough, and paid to read that title aloud. `isEnriched` is what every other
  // part of the app already uses to mean "this lesson has content".
  if (!lesson.isEnriched) {
    throw new ApiError(
      400,
      'nothing_to_narrate',
      'This lesson has not been written yet. Write it first, then it can be read aloud.'
    );
  }

  const existing = await LessonAudio.findOne({ lesson: lesson._id });

  if (existing) {
    trace(`  audio: "${lesson.title}" cache hit, ${Math.round(existing.mp3.length / 1024)}KB`);

    res.set('Content-Type', 'audio/mpeg');
    return res.send(existing.mp3);
  }

  const { bytes, chars } = await generateLessonAudio(lesson);

  // upsert, not create: two clicks a second apart both find no audio and both
  // generate. The unique index would make the second insert throw; upsert makes
  // it overwrite instead, so the user gets audio rather than a 500.
  await LessonAudio.findOneAndUpdate(
    { lesson: lesson._id },
    { lesson: lesson._id, mp3: bytes, chars },
    { upsert: true, new: true }
  );

  trace(
    `  audio: "${lesson.title}" stored ${Math.round(bytes.length / 1024)}KB, total ${Math.round(performance.now() - startedAt)}ms`
  );

  res.set('Content-Type', 'audio/mpeg');
  res.status(201).send(bytes);
}
