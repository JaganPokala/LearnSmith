import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import LessonProgress from '../models/LessonProgress.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { ApiError } from '../middlewares/errorHandler.js';

export const HISTORY_PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function questionVersion(block) {
  return createHash('sha256').update(JSON.stringify([
    block.question, block.options, block.answer, block.explanation,
  ])).digest('hex');
}

export function questionDescriptors(lesson) {
  if (!lesson.isEnriched || !Array.isArray(lesson.content)) return [];
  return lesson.content.flatMap((block, index) => {
    const valid = block?.type === 'mcq' && typeof block.question === 'string' && block.question.trim() &&
      typeof block.explanation === 'string' && block.explanation.trim() && Array.isArray(block.options) && block.options.length >= 2 &&
      block.options.every((option) => typeof option === 'string' && option.trim()) &&
      Number.isSafeInteger(block.answer) && block.answer >= 0 && block.answer < block.options.length;
    return valid ? [{ questionIndex: index, version: questionVersion(block) }] : [];
  });
}

export function progressView(row) {
  return { completed: row?.completed ?? false, completedAt: row?.completedAt ?? null, lastOpenedAt: row?.lastOpenedAt ?? null };
}

export function attemptView(row) {
  return {
    id: String(row._id), submissionId: row.submissionId, questionIndex: row.questionIndex,
    questionVersion: row.questionVersion, selectedOption: row.selectedOption,
    correctOption: row.correctOption, isCorrect: row.isCorrect, question: row.question,
    options: row.options, explanation: row.explanation, createdAt: row.createdAt,
  };
}

async function ensureProgress(creator, lesson) {
  await LessonProgress.init();
  try {
    await LessonProgress.updateOne({ creator, lesson: lesson._id }, {
      $setOnInsert: { creator, lesson: lesson._id, course: lesson.course },
    }, { upsert: true, runValidators: true });
  } catch (err) {
    if (!(err.code === 11000 && err.keyPattern?.creator === 1 && err.keyPattern?.lesson === 1)) throw err;
  }
}

export async function recordLessonVisit(creator, lesson) {
  await ensureProgress(creator, lesson);
  return LessonProgress.findOneAndUpdate({ creator, lesson: lesson._id }, {
    $max: { lastOpenedAt: new Date() },
  }, { returnDocument: 'after', runValidators: true });
}

export async function setLessonCompletion(creator, lesson, completed) {
  if (typeof completed !== 'boolean') throw new ApiError(400, 'invalid_progress', 'Send completed as true or false.');
  if (completed && !lesson.isEnriched) throw new ApiError(409, 'lesson_not_ready', 'Write this lesson before marking it complete.');
  await ensureProgress(creator, lesson);
  // A repeated PUT preserves the original completion time. Counts are derived
  // from these unique records, not incremented once per request.
  const updated = await LessonProgress.findOneAndUpdate({ creator, lesson: lesson._id, completed: { $ne: completed } }, {
    $set: { completed, completedAt: completed ? new Date() : null },
  }, { returnDocument: 'after', runValidators: true });
  return updated ?? LessonProgress.findOne({ creator, lesson: lesson._id });
}

export async function readLessonLearning(creator, lesson, before) {
  if (before !== undefined && (typeof before !== 'string' || !/^[a-f0-9]{24}$/i.test(before))) {
    throw new ApiError(400, 'invalid_cursor', 'Invalid quiz history cursor.');
  }
  const match = { creator, lesson: lesson._id };
  const descriptors = questionDescriptors(lesson);
  const [progress, page, summaries] = await Promise.all([
    LessonProgress.findOne(match).lean(),
    QuizAttempt.find({ ...match, ...(before ? { _id: { $lt: new mongoose.Types.ObjectId(before) } } : {}) })
      .sort({ _id: -1 }).limit(HISTORY_PAGE_SIZE + 1).lean(),
    descriptors.length ? QuizAttempt.aggregate([
      { $match: { ...match, questionVersion: { $in: descriptors.map((item) => item.version) } } },
      { $sort: { _id: -1 } },
      { $group: { _id: { index: '$questionIndex', version: '$questionVersion' }, count: { $sum: 1 }, latest: { $first: '$$ROOT' } } },
    ]) : [],
  ]);
  const attempts = page.slice(0, HISTORY_PAGE_SIZE);
  return {
    progress: progressView(progress),
    questions: descriptors.map((item) => {
      const summary = summaries.find((row) => row._id.index === item.questionIndex && row._id.version === item.version);
      return { ...item, attemptCount: summary?.count ?? 0, latestAttempt: summary ? attemptView(summary.latest) : null };
    }),
    attempts: attempts.map(attemptView),
    nextCursor: page.length > HISTORY_PAGE_SIZE ? String(attempts.at(-1)._id) : null,
  };
}

export async function saveQuizAttempt(creator, lesson, body) {
  const { submissionId, questionIndex, questionVersion: version, selectedOption } = body ?? {};
  if (typeof submissionId !== 'string' || !UUID.test(submissionId) || !Number.isSafeInteger(questionIndex) || questionIndex < 0 ||
      !Number.isSafeInteger(selectedOption) || selectedOption < 0 || typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) {
    throw new ApiError(400, 'invalid_quiz_attempt', 'Send a submission UUID, question index/version, and selected option index.');
  }
  if (!lesson.isEnriched) throw new ApiError(409, 'lesson_not_ready', 'Write the lesson before answering its questions.');
  await QuizAttempt.init();
  const replay = (row) => {
    if (String(row.lesson) !== String(lesson._id) || row.questionIndex !== questionIndex || row.questionVersion !== version || row.selectedOption !== selectedOption) {
      throw new ApiError(409, 'submission_conflict', 'This submission ID was already used for a different answer.');
    }
    return { attempt: attemptView(row), replayed: true };
  };
  const existing = await QuizAttempt.findOne({ creator, submissionId });
  if (existing) return replay(existing);
  const descriptor = questionDescriptors(lesson).find((item) => item.questionIndex === questionIndex);
  if (!descriptor) throw new ApiError(400, 'invalid_quiz_question', 'This block is not a valid quiz question.');
  if (version !== descriptor.version) throw new ApiError(409, 'quiz_changed', 'This question changed. Refresh the lesson before answering.');
  const block = lesson.content[questionIndex];
  if (selectedOption >= block.options.length) throw new ApiError(400, 'invalid_quiz_attempt', 'The selected option does not exist.');
  try {
    const row = await QuizAttempt.create({
      creator, lesson: lesson._id, course: lesson.course, submissionId, questionIndex, questionVersion: version,
      selectedOption, correctOption: block.answer, isCorrect: selectedOption === block.answer,
      question: block.question, options: block.options, explanation: block.explanation,
    });
    return { attempt: attemptView(row), replayed: false };
  } catch (err) {
    if (!(err.code === 11000 && err.keyPattern?.creator === 1 && err.keyPattern?.submissionId === 1)) throw err;
    const duplicate = await QuizAttempt.findOne({ creator, submissionId });
    if (!duplicate) throw err;
    return replay(duplicate);
  }
}
