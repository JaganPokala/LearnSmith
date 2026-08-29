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
 * Persist a generated course outline as Course + Module + Lesson documents.
 *
 * Phase 3 hands back one nested object; Phase 2 stores three linked collections
 * (D7). This function is the join between them, and it is the only place that
 * knows how to turn one into the other.
 *
 * WRITE COUNT: 1 course + N modules + M lessons — around 20 documents for a
 * typical course. There is no transaction, so a failure partway leaves a
 * half-written tree that nothing points to and nothing cleans up.
 *
 * @param {object} generated  validated output of generateCourse()
 * @param {string} creator    Auth0 `sub`, or the dev placeholder until Phase 8
 * @returns {Promise<object>} the saved Course, populated two levels deep
 */
export async function saveCourseTree(generated, creator) {
  // 4. WRAP STEPS 1-3 IN try/catch. On failure, call deleteCourseTree(course._id)
  //    to remove whatever was written, then rethrow.
  //    Without this a failed generation leaves orphaned modules and lessons in
  //    the database forever — invisible to every query, growing quietly. You
  //    already have the cleanup function; this is the reason it was worth
  //    writing as a plain function rather than a delete hook.
  //    Guard the cleanup itself: if the course was never created there is
  //    nothing to clean up, and a throw inside a catch hides the real error.

  // Declared outside the try so the catch can still see what to clean up.
  let course;

  try {
    // 1. Create the Course FIRST, with an empty `modules` array.
    //    Modules need a course id to exist at all (Module.course is required), so
    //    the parent has to be written before the children. The array gets filled
    //    in at the end.
    //
    //    `creator` comes from the caller — NEVER from `generated`. The model has
    //    no business naming an owner, and in Phase 8 that field decides who can
    //    read the course.

    course = await Course.create({
      title: generated.title,
      description: generated.description ?? '',
      tags: generated.tags ?? [],
      creator,
      modules: [],
    });

    // 2. For each module in generated.modules, IN ORDER:
    //      a. Create the Module with { title, course: course._id, lessons: [] }.
    //      b. Create every Lesson for it: { title, module: module._id }.
    //         Content is deliberately left empty — lessons are titles only until
    //         someone opens them (Task 4.3). isEnriched defaults to false.
    //      c. Push the lesson ids onto module.lessons and save the module.
    //      d. Push the module id onto the course's modules array.
    //
    //    ORDER MATTERS for the array fields: `modules` and `lessons` are what the
    //    UI renders in sequence, so they must be pushed in the order the model
    //    produced them. Creating lessons with Promise.all would be faster and
    //    would scramble that order — use a sequential loop, or map ids back to
    //    their original positions afterwards.

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
          // Denormalised parent — see the note on the field in models/Lesson.js.
          // Set here, at the only place lessons are ever created, so it cannot
          // be forgotten.
          course: course._id,
        });

        savedModule.lessons.push(savedLesson._id);
      }

      await savedModule.save();
      course.modules.push(savedModule._id);
    }

    // 3. Save the course once, now that its modules array is filled.

    await course.save();
  } catch (err) {
    if (course?._id) {
      try {
        await deleteCourseTree(course._id);
      } catch (cleanupErr) {
        // Never let the cleanup's own failure replace the real error.
        console.error(`  saveCourseTree: rollback failed - ${cleanupErr.message}`);
      }
    }

    throw err;
  }

  // 5. Return the course populated two levels deep:
  //      .populate({ path: 'modules', populate: { path: 'lessons' } })
  //    The client needs the whole tree to render, and re-fetching it is a
  //    second round trip for data we just wrote.
  //
  // Outside the try on purpose: by here the tree is written correctly, and a
  // populate hiccup must not trigger a rollback of good data.

  return course.populate({ path: 'modules', populate: { path: 'lessons' } });
}

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

  // Lessons now carry `course` directly (see models/Lesson.js), so they can be
  // deleted in ONE indexed query instead of first fetching module ids and using
  // $in. That is not only shorter - it is more correct. The old version could
  // only find lessons through their module, so a lesson whose module row had
  // gone missing was invisible to the cascade and survived forever. Deleting by
  // course catches those too.

  const lessonResult = await Lesson.deleteMany({ course: courseId });
  const lessonsDeleted = lessonResult.deletedCount;

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
