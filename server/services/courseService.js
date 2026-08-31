/**
 * Operations that span more than one collection.
 *
 * Plain functions rather than mongoose hooks: hooks fire on the exact method
 * registered, so `pre('deleteOne')` defaults to the QUERY middleware and never
 * runs for `doc.deleteOne()`. A cascade that silently does not fire is worse
 * than none, because the code looks like it is handling something.
 */

import Course from '../models/Course.js';
import Module from '../models/Module.js';
import Lesson from '../models/Lesson.js';
import { traceError } from '../middlewares/trace.js';

/**
 * Persist a generated outline as Course + Module + Lesson documents — around 20
 * writes, with no transaction, so a failure partway is rolled back by hand.
 *
 * @param {object} generated  validated output of generateCourse()
 * @param {string} creator    Auth0 `sub`, or the dev placeholder until Phase 8
 * @returns {Promise<object>} the saved Course, populated two levels deep
 */
export async function saveCourseTree(generated, creator) {
  // Declared outside the try so the catch can still see what to clean up.
  let course;

  try {
    // The course first: Module.course is required, so the parent must exist
    // before the children. `creator` comes from the caller, NEVER from the
    // model — in Phase 8 that field decides who can read the course.
    course = await Course.create({
      title: generated.title,
      description: generated.description ?? '',
      tags: generated.tags ?? [],
      creator,
      modules: [],
    });

    // Sequential, not Promise.all. The `modules` and `lessons` arrays are what
    // the UI renders in order, and parallel creation would scramble them.
    for (const generatedModule of generated.modules) {
      const savedModule = await Module.create({
        title: generatedModule.title,
        course: course._id,
        lessons: [],
      });

      for (const generatedLesson of generatedModule.lessons) {
        const savedLesson = await Lesson.create({
          title: generatedLesson.title,
          module: savedModule._id,
          // Denormalised parent, set at the only place lessons are created so
          // it cannot be forgotten.
          course: course._id,
        });

        savedModule.lessons.push(savedLesson._id);
      }

      await savedModule.save();
      course.modules.push(savedModule._id);
    }

    await course.save();
  } catch (err) {
    // Without this, a failed generation leaves orphaned modules and lessons
    // that no query reaches and nothing cleans up.
    if (course?._id) {
      try {
        await deleteCourseTree(course._id);
      } catch (cleanupErr) {
        // Never let the cleanup's own failure replace the real error.
        traceError(`  saveCourseTree: rollback failed - ${cleanupErr.message}`);
      }
    }

    throw err;
  }

  // Outside the try on purpose: the tree is written correctly by here, and a
  // populate hiccup must not roll back good data.
  return course.populate({ path: 'modules', populate: { path: 'lessons' } });
}

/**
 * Delete a course and everything beneath it. Returns COUNTS rather than
 * true/void — the only way to tell "deleted a course with 12 lessons" from
 * "deleted a course and silently missed its lessons".
 *
 * @param {string} courseId
 * @returns {Promise<null | { lessons: number, modules: number, course: number }>}
 *   null if no course with that id exists.
 */
export async function deleteCourseTree(courseId) {
  const course = await Course.findById(courseId);

  if (!course) return null;

  // Deleted by `course`, not by walking module ids: a lesson whose module row
  // went missing was invisible to the old cascade and survived forever.
  const lessonResult = await Lesson.deleteMany({ course: courseId });

  // Queried by the `course` field rather than reading course.modules — the
  // two-way reference can disagree, and the collection is the source of truth.
  const moduleResult = await Module.deleteMany({ course: courseId });

  const courseResult = await Course.deleteOne({ _id: courseId });

  // ORDER: lessons -> modules -> course, and it is not stylistic. With no
  // transaction, bottom-up leaves the course present so a half-finished delete
  // can be found and rerun. Top-down leaves modules nothing points at, which is
  // permanent.
  return {
    lessons: lessonResult.deletedCount,
    modules: moduleResult.deletedCount,
    course: courseResult.deletedCount,
  };
}
