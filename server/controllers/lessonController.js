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
  lesson.content = generated.content;
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
