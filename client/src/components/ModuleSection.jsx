import LessonRow from "./LessonRow.jsx";

export default function ModuleSection({
  number,
  module,
  startNumber,
  completedLessonIds,
}) {
  const lessons = module.lessons ?? [];
  const completed = completedLessonIds
    ? lessons.filter((lesson) =>
        completedLessonIds.includes(String(lesson._id)),
      ).length
    : null;
  return (
    <section
      className="learning-module"
      aria-label={`Module ${number}: ${module.title}`}
    >
      <header>
        <span>Module {number}</span>
        <h3>{module.title}</h3>
        <span>
          {completed === null
            ? `${lessons.length} lessons`
            : `${completed} of ${lessons.length} completed`}
        </span>
      </header>
      {lessons.map((lesson, index) => (
        <LessonRow
          key={lesson._id}
          number={startNumber + index}
          lesson={lesson}
          completed={completedLessonIds?.includes(String(lesson._id))}
        />
      ))}
    </section>
  );
}
