import Course from '../models/Course.js';
import { ApiError } from '../middlewares/errorHandler.js';

// Bound serialized JSON, including escaping and labels, rather than just prose.
export const MAX_COURSE_CONTEXT_CHARS = 12_000;
const MAX_OUTLINE_LESSONS = 40;

function compact(value, limit) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function objectives(values, count = 3) {
  return Array.isArray(values)
    ? values.slice(0, count).map((value) => compact(value, 180)).filter(Boolean)
    : [];
}

/** Pure projection: array order is curriculum order; bodies/activity never enter. */
export function buildLessonCourseContext(course, lessonId) {
  const entries = [];
  for (const [moduleIndex, module] of (course.modules ?? []).entries()) {
    if (!module || String(module.course) !== String(course._id)) continue;
    for (const [lessonIndex, lesson] of (module.lessons ?? []).entries()) {
      if (!lesson || String(lesson.course) !== String(course._id)
        || String(lesson.module) !== String(module._id)) continue;
      entries.push({
        id: String(lesson._id),
        position: entries.length + 1,
        modulePosition: moduleIndex + 1,
        lessonPosition: lessonIndex + 1,
        moduleTitle: compact(module.title, 160),
        title: compact(lesson.title, 160),
        objectives: objectives(lesson.objectives),
      });
    }
  }

  const index = entries.findIndex((entry) => entry.id === String(lessonId));
  if (index < 0) {
    throw new ApiError(409, 'lesson_outline_invalid', 'This lesson is missing from its course outline.');
  }
  const { id, ...current } = entries[index];
  const context = {
    course: { title: compact(course.title, 160), description: compact(course.description, 800) },
    totalModules: course.modules.length,
    totalLessons: entries.length,
    current,
    outline: [],
    omittedLessons: entries.length,
  };

  // Keep the target, then nearby earlier coverage, then upcoming topics. Return
  // them in original order with explicit omissions; never clip serialized JSON.
  const priority = [entries[index], ...entries.slice(0, index).reverse(), ...entries.slice(index + 1)];
  for (const entry of priority) {
    if (context.outline.length >= MAX_OUTLINE_LESSONS) break;
    const { id: ignoredId, ...summary } = entry;
    const candidate = {
      ...summary,
      relation: entry.position < current.position ? 'earlier_planned'
        : entry.position === current.position ? 'current' : 'later_planned',
    };
    context.outline.push(candidate);
    context.outline.sort((a, b) => a.position - b.position);
    context.omittedLessons = entries.length - context.outline.length;
    if (JSON.stringify(context).length > MAX_COURSE_CONTEXT_CHARS) {
      context.outline = context.outline.filter((item) => item !== candidate);
      context.omittedLessons = entries.length - context.outline.length;
    }
  }
  return context;
}

export async function loadLessonCourseContext({ courseId, lessonId, creator }) {
  const course = await Course.findOne({ _id: courseId, creator })
    .select('title description modules')
    .populate({
      path: 'modules', select: 'title course lessons', match: { course: courseId },
      populate: {
        path: 'lessons', select: 'title objectives course module', match: { course: courseId },
      },
    }).lean();
  if (!course) throw new ApiError(404, 'lesson_not_found', 'This lesson is not available to you.');
  return buildLessonCourseContext(course, lessonId);
}
