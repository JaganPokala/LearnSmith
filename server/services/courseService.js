/**
 * server/services/courseService.js
 *
 * Operations that span more than one collection. Routes call these; they do not
 * orchestrate deletes themselves.
 *
 * WHY A PLAIN FUNCTION AND NOT A MONGOOSE HOOK
 *
 * Mongoose hooks fire on the exact method you registered, not on the idea of
 * deleting. These are all different middlewares:
 *
 *   doc.deleteOne()               -> DOCUMENT middleware 'deleteOne'
 *   Course.deleteOne({...})       -> QUERY middleware 'deleteOne'   (same name!)
 *   Course.findByIdAndDelete(id)  -> 'findOneAndDelete'
 *   Course.deleteMany({...})      -> 'deleteMany'
 *
 * Register for one, call another, and the hook silently never runs. No warning,
 * no error — and a cascade that silently does not fire is worse than none,
 * because the code looks like it is handling something. (The two `deleteOne`
 * variants are the worst pair: identical name, different middleware type, and
 * `this` means something different in each. `pre('deleteOne')` defaults to the
 * QUERY version; getting the document one requires
 * { document: true, query: false }.)
 *
 * An explicit function cannot half-work. Either it was called or it was not,
 * and that is visible at the call site.
 */

import Course from '../models/Course.js';
import Module from '../models/Module.js';
import Lesson from '../models/Lesson.js';

/**
 * Delete a course and everything beneath it.
 *
 * @param {string} courseId
 * @returns {Promise<null | { lessons: number, modules: number, course: number }>}
 *   null if no course with that id exists; otherwise how many documents were
 *   actually removed at each level.
 *
 * Returning COUNTS rather than true/void is deliberate: it is the only way the
 * caller — or a test — can tell "deleted a course with 12 lessons" from
 * "deleted a course and silently missed its lessons". Both otherwise look like
 * success.
 */
export async function deleteCourseTree(courseId) {
  // 1. Find the course. If it does not exist, return null so the route can
  //    answer 404 rather than reporting a successful delete of nothing.

  const course = await Course.findById(courseId);

  if (!course) return null;

  // 2. Find this course's modules by QUERYING Module.find({ course: courseId }),
  //    NOT by reading course.modules.
  //    The two-way reference (D7) means those can disagree: a module created
  //    without its id being pushed onto the course is invisible in the array but
  //    very much present in the collection. Trusting the array would leave it
  //    behind forever. Querying by the `course` field is the source of truth,
  //    and Task 2.2's index on it is what makes this cheap.

  const modules = await Module.find({ course: courseId }).select('_id');

  // 3. Collect the module _ids into an array.

  const moduleIds = modules.map((module) => module._id);

  // 4. Delete lessons: Lesson.deleteMany({ module: { $in: moduleIds } }).
  //    Skip this if there are no modules — $in on an empty array matches
  //    nothing, which is harmless, but the intent is clearer written out.

  let lessonsDeleted = 0;

  if (moduleIds.length > 0) {
    const lessonResult = await Lesson.deleteMany({ module: { $in: moduleIds } });
    lessonsDeleted = lessonResult.deletedCount;
  }

  // 5. Delete the modules: Module.deleteMany({ course: courseId }).

  const moduleResult = await Module.deleteMany({ course: courseId });

  // 6. Delete the course itself.

  const courseResult = await Course.deleteOne({ _id: courseId });

  // ORDER: lessons -> modules -> course. Bottom-up, and it is not stylistic.
  // There is no transaction here, so a failure halfway leaves partial state.
  // Bottom-up, the worst case is lessons gone and modules remaining — the
  // course still exists, so you can find them and run the delete again.
  // Top-down, the worst case is the course gone while its modules remain:
  // nothing points at them any more, no query reaches them, and there is no way
  // left to identify which modules belonged to the course you just deleted.
  // One is recoverable, the other is permanent.

  // 7. deleteMany() resolves to a result object carrying `deletedCount`.
  //    Return those numbers, not the raw result objects.

  return {
    lessons: lessonsDeleted,
    modules: moduleResult.deletedCount,
    course: courseResult.deletedCount,
  };
}
