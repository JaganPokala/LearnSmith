/**
 * server/controllers/lessonController.js
 *
 * Lazy lesson content.
 *
 * When a course is created its lessons are titles only — `content: []`,
 * `isEnriched: false`. The body is written the first time somebody opens the
 * lesson, and served from the database every time after.
 *
 * WHY LAZY: a 5x4 course is 20 lessons. Measured lesson generation is ~9-13s,
 * so generating them all at course-creation time is three to four minutes of
 * spinner before the user sees anything — for lessons most users never open.
 * This one decision is what makes the app usable.
 */

import Lesson from '../models/Lesson.js';
import Module from '../models/Module.js';
import Course from '../models/Course.js';
import { generateLesson } from '../services/lessonGenerator.js';
import { ApiError } from '../middlewares/errorHandler.js';

/** Same placeholder as courseController until Phase 8. See the note there. */
const DEV_CREATOR = 'dev-user';

/**
 * POST /api/lessons/:id/generate
 *
 * First call  : generates content (~9-13s), saves it, returns the lesson.
 * Later calls : returns the saved copy (~50ms).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function generateLessonContent(req, res) {
  const startedAt = performance.now();

  // 1. Load the lesson by req.params.id.
  //    A malformed id throws CastError -> 400 invalid_id, already handled (D10).
  //    Missing lesson -> ApiError(404, 'lesson_not_found', ...).

  const lesson = await Lesson.findById(req.params.id);

  if (!lesson) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  // 2. OWNERSHIP. A Lesson has no `creator` — ownership lives on the Course
  //    (Task 2.2 deliberately kept one copy of that fact). So walk up:
  //      lesson.module -> Module -> module.course -> Course -> course.creator
  //    and 404 if the course is not this user's.
  //
  //    Do it now, with the placeholder. Phase 8 changes DEV_CREATOR to
  //    req.auth.payload.sub and nothing else. Skipping it today means
  //    /api/lessons/<any-id>/generate reads and WRITES to any user's lesson the
  //    moment real users exist — and it would cost them an API call too.
  //
  //    Two extra queries. Worth it: this is the only path that mutates a lesson.

  // Lessons now carry `course` directly (models/Lesson.js), so ownership is one
  // indexed lookup rather than a two-hop walk up the tree. The module is still
  // needed - but only for its TITLE, which the generator uses as context, not
  // for the security check. So the two run in PARALLEL instead of in sequence.
  const [course, module] = await Promise.all([
    Course.findOne({ _id: lesson.course, creator: DEV_CREATOR }),
    Module.findById(lesson.module),
  ]);

  // Same 404 for "no such lesson", "orphaned lesson" and "not yours": which one
  // it was is ours to debug, not the caller's to learn.
  if (!course || !module) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  // 3. THE CACHE CHECK — the whole point of the task.
  //      if (lesson.isEnriched) -> return the saved copy immediately.
  //    Log the hit, so "why is this instant" and "why is this slow" are both
  //    answerable from the log rather than guessed at.
  //
  //    Check isEnriched, NOT content.length. They differ: a generation that
  //    legitimately produced zero blocks would be retried forever by a length
  //    check. The flag records that we tried, separately from what we got.

  if (lesson.isEnriched) {
    console.log(
      `  lesson: "${lesson.title}" cache hit, ${Math.round(performance.now() - startedAt)}ms, ${lesson.content.length} blocks`
    );

    return res.json(lesson);
  }

  // 4. Gather the context generateLesson needs — the COURSE and MODULE titles,
  //    not just the lesson title. Milestone 8 asks for all three, and without
  //    them the model is writing "What is Supervised Learning?" with no idea
  //    whether it belongs to a beginner ML course or an advanced statistics one.
  //    It will guess, confidently. You already loaded both documents in step 2.

  // 5. Generate. Errors here are already typed ApiErrors (D13) — do not catch.

  const { lesson: generated, ms } = await generateLesson({
    courseTitle: course.title,
    moduleTitle: module.title,
    lessonTitle: lesson.title,
  });

  // 6. SAVE — AND THIS IS WHERE FAILURES.md W1 IS WAITING.
  //
  //    Mongoose CANNOT see mutations INSIDE a Mixed field. `Lesson.content` is
  //    [Mixed], so this writes NOTHING and throws NOTHING:
  //
  //        lesson.content[0].text = 'new';
  //        await lesson.save();          // resolves. saves nothing.
  //
  //    ASSIGN THE WHOLE ARRAY instead — `lesson.content = generated.content` —
  //    which Mongoose tracks normally. That is why the watchlist entry says to
  //    prefer whole-array assignment here.
  //
  //    Set content, objectives, and isEnriched = true, then save.
  //    Setting isEnriched BEFORE the content would leave a lesson marked
  //    "generated" with nothing in it if the save failed partway.

  lesson.content = generated.content;
  lesson.objectives = generated.objectives;
  lesson.isEnriched = true;

  await lesson.save();

  // 7. Log: lesson title, generation ms, total ms, block count, mcq count.
  //    Block and mcq counts are what tell you later whether lessons are getting
  //    thinner as prompts change.

  const mcqCount = lesson.content.filter((block) => block.type === 'mcq').length;

  console.log(
    `  lesson: "${lesson.title}" generated in ${ms}ms, total ${Math.round(performance.now() - startedAt)}ms, ${lesson.content.length} blocks, ${mcqCount} mcqs`
  );

  // 8. res.json(lesson)

  res.json(lesson);
}

/**
 * GET /api/lessons/:id
 *
 * Read one lesson, with everything the lesson page needs around it.
 *
 * THIS ROUTE NEVER GENERATES. GET is a read, and a read must be safe to repeat:
 * a refresh, a browser prefetch, or a link preview would otherwise each trigger
 * ~12 seconds of billed generation. A lesson that has not been written yet comes
 * back with isEnriched:false and an empty content array, and the client decides
 * whether to POST /generate.
 *
 * That split is also what lets the page render instantly and say "this lesson
 * has not been written yet" instead of showing an unexplained spinner.
 *
 * Returns the lesson PLUS its context, because the page needs all of it:
 *   lesson    - content and objectives; this is the only endpoint that sends them
 *   course    - { _id, title } for the breadcrumb
 *   module    - { _id, title } for the breadcrumb
 *   siblings  - the other lessons in this module, for the sidebar
 *   position  - 1-based index within the module, for "lesson 03"
 *
 * One request fills the whole screen. The alternative is fetching the lesson and
 * then the whole course, which is the heavy endpoint we just trimmed.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getLesson(req, res) {
  const lesson = await Lesson.findById(req.params.id);

  if (!lesson) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  // Ownership and context together, in parallel. Ownership rides on the
  // denormalised `course` field, so it is one indexed lookup rather than a walk
  // up the tree.
  //
  // The module is populated with its lessons because THE ARRAY ORDER IS THE
  // LESSON ORDER. Querying Lesson.find({ module }) would return them in
  // whatever order the database felt like, and the sidebar would silently
  // scramble - a bug that looks like bad generation rather than a missing sort.
  const [course, module] = await Promise.all([
    Course.findOne({ _id: lesson.course, creator: DEV_CREATOR }).select('title'),
    Module.findById(lesson.module)
      .select('title lessons')
      .populate({ path: 'lessons', select: 'title isEnriched' }),
  ]);

  // Same 404 for "no such lesson", "orphaned lesson" and "not yours". Which one
  // it was is ours to debug, not the caller's to learn.
  if (!course || !module) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  const siblings = module.lessons;
  const index = siblings.findIndex((s) => String(s._id) === String(lesson._id));

  console.log(
    `  lesson: read "${lesson.title}" isEnriched=${lesson.isEnriched} blocks=${lesson.content.length}`
  );

  res.json({
    lesson,
    course: { _id: course._id, title: course.title },
    module: { _id: module._id, title: module.title },
    siblings,
    // -1 would mean the lesson is not listed in its own module's array - a
    // broken link the UI should not try to render a number for.
    position: index === -1 ? null : index + 1,
    total: siblings.length,
  });
}
