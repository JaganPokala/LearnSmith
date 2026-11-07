// Completion is manual and independent of whether lesson content was generated.
export function courseCompletion(course) {
  const total = Math.max(0, course.lessonCount ?? 0);
  const completed = Math.min(
    total,
    Math.max(0, course.completedLessonCount ?? 0),
  );
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    finished: total > 0 && completed === total,
  };
}

export function courseDestination(course) {
  if (courseCompletion(course).finished)
    return { label: "Review course", to: `/courses/${course._id}` };
  if (course.resumeLessonId)
    return {
      label: "Continue learning",
      to: `/lessons/${course.resumeLessonId}`,
    };
  return { label: "View course", to: `/courses/${course._id}` };
}
