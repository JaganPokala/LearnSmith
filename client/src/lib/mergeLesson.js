/**
 * Merge a freshly generated lesson into the lesson page's context object.
 *
 * Pure and dependency-free on purpose: this is the state transition F3 lived
 * in, so it is kept out of the hook where it can be run directly.
 *
 * @param {object|null} current     { lesson, course, module, siblings, ... }
 * @param {object} newLesson        the lesson POST /generate returned
 */
export function mergeGeneratedLesson(current, newLesson) {
  if (!current) return current;

  // F3: LessonPage does not unmount between siblings, so a generation started
  // on one lesson can resolve while another is on screen. Only swap the body
  // when the finished lesson IS the one being shown. The sibling dot flips
  // either way — that lesson really was written, whatever page you are on.
  const isOnScreen = String(current.lesson?._id) === String(newLesson._id);

  return {
    ...current,
    lesson: isOnScreen ? newLesson : current.lesson,
    siblings: current.siblings?.map((sibling) =>
      String(sibling._id) === String(newLesson._id)
        ? { ...sibling, isEnriched: true }
        : sibling,
    ),
  };
}
