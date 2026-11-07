import { Link } from "react-router-dom";
import DeleteButton from "../../components/DeleteButton.jsx";

// Pure presentation: saved progress remains owned by useCourseProgress.
export default function CourseOverview({
  course,
  moduleCount,
  lessonCount,
  writtenCount,
  progress,
  firstLesson,
  onDeleted,
}) {
  const saved = progress.data;
  const finished =
    saved &&
    saved.totalLessons > 0 &&
    saved.completedLessons === saved.totalLessons;
  const destination = saved?.resumeLesson?.id ?? firstLesson?._id;
  return (
    <section className="course-overview mt-6" aria-label="Course overview">
      <header className="learning-heading">
        <div>
          <p className="learning-eyebrow">Your learning path</p>
          <h1>{course.title}</h1>
          {course.description && <p>{course.description}</p>}
        </div>
      </header>
      <div className="course-metadata">
        <span>{moduleCount} modules</span>
        <span>{lessonCount} lessons</span>
        <span>{writtenCount} ready to read</span>
        <details className="course-options">
          <summary>Course options</summary>
          <div>
            <DeleteButton
              courseId={course._id}
              variant="page"
              onDeleted={onDeleted}
            />
          </div>
        </details>
      </div>
      <div className="course-progress" aria-label="Course progress">
        {saved ? (
          <>
            <p>
              {saved.completedLessons} of {saved.totalLessons} lessons completed
              · {saved.percent}%
            </p>
            <progress
              max={saved.totalLessons || 1}
              value={saved.completedLessons}
              aria-label="Lessons marked complete"
            />
            {destination && (
              <Link className="learning-button" to={`/lessons/${destination}`}>
                {finished
                  ? "Review course"
                  : saved.resumeLesson
                    ? "Continue learning"
                    : "Start learning"}{" "}
                →
              </Link>
            )}
            <p className="learning-helper">
              {finished
                ? "All lessons are marked complete. Revisit them whenever you like."
                : saved.resumeLesson
                  ? `Last opened: ${saved.resumeLesson.title}`
                  : "Choose a lesson below. Generate its content when you’re ready."}
            </p>
          </>
        ) : progress.error ? (
          <p role="alert">
            Your saved progress couldn’t load.{" "}
            <button className="learning-link" onClick={progress.refresh}>
              Try again
            </button>{" "}
            You can still browse the outline below.
          </p>
        ) : (
          <p role="status">Loading saved progress…</p>
        )}
      </div>
    </section>
  );
}
