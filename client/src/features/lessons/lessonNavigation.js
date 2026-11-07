// The server's module and lesson order is the course order. Crossing a module
// boundary must not send a learner back through the overview page.
export function lessonNeighbours(course, siblings, lessonId) {
  const lessons =
    course?.modules?.flatMap((module) => module.lessons ?? []) ??
    siblings ??
    [];
  const index = lessons.findIndex(
    (lesson) => String(lesson._id) === String(lessonId),
  );
  return {
    previous: index > 0 ? lessons[index - 1] : null,
    next: index >= 0 ? (lessons[index + 1] ?? null) : null,
  };
}
