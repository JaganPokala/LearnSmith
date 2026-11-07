import { Link } from "react-router-dom";

export default function LessonNavigation({
  previous,
  next,
  courseId,
  compact = false,
}) {
  return (
    <nav
      className={`lesson-navigation ${compact ? "compact" : ""}`}
      aria-label={compact ? "Lesson shortcuts" : "Continue learning"}
    >
      {previous ? (
        <Link to={`/lessons/${previous._id}`}>
          <span>← Previous lesson</span>
          {!compact && <strong>{previous.title}</strong>}
        </Link>
      ) : (
        <Link to={`/courses/${courseId}`}>
          <span>← Course overview</span>
          {!compact && <strong>See your learning path</strong>}
        </Link>
      )}
      {next ? (
        <Link to={`/lessons/${next._id}`}>
          <span>Next lesson →</span>
          {!compact && <strong>{next.title}</strong>}
        </Link>
      ) : (
        <Link to={`/courses/${courseId}`}>
          <span>Back to course →</span>
          {!compact && <strong>Review your progress</strong>}
        </Link>
      )}
    </nav>
  );
}
