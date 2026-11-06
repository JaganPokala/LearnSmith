import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import LessonProgress from '../models/LessonProgress.js';
import { creatorOf } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { findOwnedLesson } from '../services/ownedLesson.js';
import { progressView, recordLessonVisit, setLessonCompletion, readLessonLearning, saveQuizAttempt } from '../services/learningService.js';

export async function getLessonLearning(req, res) {
  const creator = creatorOf(req);
  const lesson = await findOwnedLesson(req.params.id, creator);
  res.set('Cache-Control', 'private, no-store');
  res.json(await readLessonLearning(creator, lesson, req.query.before));
}

export async function visitLesson(req, res) {
  const creator = creatorOf(req);
  const lesson = await findOwnedLesson(req.params.id, creator);
  res.set('Cache-Control', 'private, no-store');
  res.json({ progress: progressView(await recordLessonVisit(creator, lesson)) });
}

export async function updateLessonProgress(req, res) {
  const creator = creatorOf(req);
  const lesson = await findOwnedLesson(req.params.id, creator);
  res.set('Cache-Control', 'private, no-store');
  res.json({ progress: progressView(await setLessonCompletion(creator, lesson, req.body?.completed)) });
}

export async function submitQuizAttempt(req, res) {
  const creator = creatorOf(req);
  const lesson = await findOwnedLesson(req.params.id, creator);
  const saved = await saveQuizAttempt(creator, lesson, req.body);
  res.set('Cache-Control', 'private, no-store');
  res.status(saved.replayed ? 200 : 201).json(saved);
}

export async function getCourseProgress(req, res) {
  const creator = creatorOf(req);
  const course = await Course.findOne({ _id: req.params.id, creator }).select('_id');
  if (!course) throw new ApiError(404, 'course_not_found', 'This course does not exist or is not available to you.');
  const lessons = await Lesson.find({ course: course._id }).select('_id title isEnriched').lean();
  const rows = await LessonProgress.find({ creator, course: course._id, lesson: { $in: lessons.map((lesson) => lesson._id) } })
    .sort({ lastOpenedAt: -1, _id: -1 }).lean();
  const written = new Set(lessons.filter((lesson) => lesson.isEnriched).map((lesson) => String(lesson._id)));
  const completedLessonIds = rows.filter((row) => row.completed && written.has(String(row.lesson))).map((row) => String(row.lesson));
  const last = rows.find((row) => row.lastOpenedAt);
  const resume = last ? lessons.find((lesson) => String(lesson._id) === String(last.lesson)) : null;
  res.set('Cache-Control', 'private, no-store');
  res.json({ totalLessons: lessons.length, completedLessons: completedLessonIds.length,
    percent: lessons.length ? Math.round(completedLessonIds.length / lessons.length * 100) : 0,
    completedLessonIds, resumeLesson: resume ? { id: String(resume._id), title: resume.title } : null });
}
