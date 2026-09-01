/**
 * The HTTP layer: knows about req, res and status codes, and nothing about
 * prompts, schemas or retries. The services know nothing about HTTP.
 */

import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import { generateCourse } from '../services/courseGenerator.js';
import { saveCourseTree, deleteCourseTree } from '../services/courseService.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { trace } from '../middlewares/trace.js';

/**
 * Every course belongs to this one shared owner until Auth0 lands in Phase 8,
 * where it becomes req.auth.payload.sub. One library, shared by every visitor.
 */
const GUEST_CREATOR = 'guest-user';

/** Longest prompt worth sending. Beyond this it is not a topic, it is an essay. */
const MAX_PROMPT_LENGTH = 200;

/** Bound on the library list. Pagination replaces it when a library outgrows it. */
const LIST_LIMIT = 50;

/**
 * Validate the incoming prompt and return the cleaned topic.
 *
 * Measured: an empty topic does not fail, the model INVENTS one. Nothing in
 * this pipeline can answer "I do not know", so anything not rejected here comes
 * back as a confident course the user never asked for.
 *
 * @param {unknown} body  req.body — clients send anything
 * @returns {string} the trimmed topic
 * @throws {ApiError} 400 with a code the frontend can branch on
 */
function readTopic(body) {
  // Express 5 leaves req.body undefined when no JSON content-type arrived.
  if (typeof body !== 'object' || body === null) {
    throw new ApiError(400, 'missing_prompt', 'Send a JSON body with a "prompt" field.');
  }

  // { "prompt": 42 } and { "prompt": null } are both valid JSON.
  const { prompt } = body;

  if (typeof prompt !== 'string') {
    throw new ApiError(
      400,
      'missing_prompt',
      `"prompt" must be a string, received ${prompt === null ? 'null' : typeof prompt}.`
    );
  }

  // Whitespace-only is the dangerous case: "   " looks identical to "" in a
  // form and in a log.
  const topic = prompt.trim();

  if (topic === '') {
    throw new ApiError(400, 'empty_prompt', 'Type a topic to generate a course about.');
  }

  if (topic.length > MAX_PROMPT_LENGTH) {
    throw new ApiError(
      400,
      'prompt_too_long',
      `A topic can be at most ${MAX_PROMPT_LENGTH} characters; this one is ${topic.length}.`
    );
  }

  return topic;
}

/**
 * POST /api/courses/generate — body { prompt }, 201 with the saved tree.
 *
 * No try/catch: Express 5 forwards async rejections, and everything thrown
 * below is already an ApiError with the right status and code.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function createCourse(req, res) {
  const startedAt = performance.now();

  // `creator` is never read from the body. If it were, anyone could write into
  // — and by the same trick read — another user's library once Phase 8 lands.
  const topic = readTopic(req.body);

  const { course, attempts, ms } = await generateCourse(topic);

  const saved = await saveCourseTree(course, GUEST_CREATOR);

  // Generation ms and total ms separately: that is what tells you later whether
  // a slow request was the model or the database.
  const totalMs = Math.round(performance.now() - startedAt);

  trace(
    `  POST /api/courses/generate "${topic}" attempts=${attempts} generate=${ms}ms total=${totalMs}ms modules=${saved.modules.length}`
  );

  // 201, not 200 — this created a resource.
  res.status(201).json(saved);
}

/**
 * GET /api/courses — the library list, newest first.
 *
 * Must NOT return lesson content: 20 courses x 20 lessons of blocks is
 * megabytes of JSON for a page that renders titles and tags.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function listCourses(req, res) {
  // The query the { creator: 1, createdAt: -1 } compound index was built for.
  const courses = await Course.find({ creator: GUEST_CREATOR })
    .select('title description tags createdAt')
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean();

  // Same SHAPE as the populated case, zeroed. A frontend that gets a different
  // shape when the list is empty crashes on a brand-new account.
  if (courses.length === 0) {
    return res.json({
      count: 0,
      totals: { courses: 0, lessons: 0, written: 0 },
      courses: [],
    });
  }

  // Every count in one pass: two queries whether there are 4 courses or 400,
  // where a countDocuments() per course would be 1 + N. A single stage only
  // because Lesson carries the denormalised `course` field.
  const courseIds = courses.map((course) => course._id);

  const counts = await Lesson.aggregate([
    { $match: { course: { $in: courseIds } } },
    {
      $group: {
        _id: '$course',
        lessonCount: { $sum: 1 },
        // $cond turns each boolean into 1 or 0 — how you count a SUBSET in the
        // same pass instead of running a second query.
        writtenCount: { $sum: { $cond: ['$isEnriched', 1, 0] } },
      },
    },
  ]);

  // String() is load-bearing: _id is an ObjectId, and objects compare by
  // identity in a Map. Without it every lookup misses, every count reads 0, and
  // nothing throws.
  const countsByCourse = new Map(counts.map((row) => [String(row._id), row]));

  // Default 0, not undefined — a half-saved course has no group in the
  // aggregation, and undefined renders as "NaN / NaN" on the card.
  const withCounts = courses.map((course) => {
    const row = countsByCourse.get(String(course._id));

    return {
      ...course,
      lessonCount: row?.lessonCount ?? 0,
      writtenCount: row?.writtenCount ?? 0,
    };
  });

  // CAVEAT: totals are across the courses RETURNED. Identical today because
  // LIST_LIMIT exceeds any real library, but pagination silently turns this
  // into "totals for this page". Fix it then by aggregating without the $in.
  const totals = withCounts.reduce(
    (acc, course) => ({
      courses: acc.courses + 1,
      lessons: acc.lessons + course.lessonCount,
      written: acc.written + course.writtenCount,
    }),
    { courses: 0, lessons: 0, written: 0 },
  );

  res.json({ count: withCounts.length, totals, courses: withCounts });
}

/**
 * GET /api/courses/:id — one course, populated two levels deep.
 * Lesson content is excluded; the lesson route is the only place it is read.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getCourse(req, res) {
  // findOne with the creator IN THE QUERY, not findById plus a check afterwards.
  // That is what makes another user's course a 404 rather than a 403 — "that
  // course exists but is not yours" is itself information.
  //
  // A malformed id throws CastError, which errorHandler turns into 400
  // invalid_id, so there is no id check here.
  const course = await Course.findOne({
    _id: req.params.id,
    creator: GUEST_CREATOR,
  }).populate({
    path: 'modules',
    // Only what a lesson ROW needs. content and objectives are the heavy fields
    // and neither is rendered on this page.
    populate: { path: 'lessons', select: 'title isEnriched' },
  });

  if (!course) {
    throw new ApiError(404, 'course_not_found', `No course with id ${req.params.id}.`);
  }

  res.json(course);
}

/**
 * DELETE /api/courses/:id — removes the course, its modules and its lessons.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function removeCourse(req, res) {
  // Ownership before deleting, and in the query — checking afterwards would
  // mean the delete had already happened.
  const course = await Course.findOne({
    _id: req.params.id,
    creator: GUEST_CREATOR,
  }).select('_id');

  if (!course) {
    throw new ApiError(404, 'course_not_found', `No course with id ${req.params.id}.`);
  }

  const deleted = await deleteCourseTree(course._id);

  // null when the course vanished between the check and the delete — unlikely
  // with one user, entirely possible with two tabs open.
  if (!deleted) {
    throw new ApiError(404, 'course_not_found', `No course with id ${req.params.id}.`);
  }

  trace(
    `  DELETE /api/courses/${req.params.id} removed ${deleted.course} course, ${deleted.modules} modules, ${deleted.lessons} lessons`
  );

  // 200 with counts, not 204. 204 forbids a body, and those counts are the only
  // evidence the cascade ran rather than leaving orphans.
  res.json({ deleted });
}
