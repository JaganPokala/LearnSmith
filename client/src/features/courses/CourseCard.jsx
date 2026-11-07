import { Link } from "react-router-dom";
import DeleteButton from "../../components/DeleteButton.jsx";
import { courseCompletion, courseDestination } from "./coursePresentation.js";

export default function CourseCard({ course, onDeleted }) {
  const { total, completed, percent, finished } = courseCompletion(course);
  const action = courseDestination(course);
  return (
    <article className="learning-card">
      <div className="learning-card-top">
        <span>
          {finished
            ? "All lessons marked complete"
            : completed > 0
              ? "In progress"
              : "Ready to explore"}
        </span>
        <details className="course-options">
          <summary aria-label={`Options for ${course.title}`}>•••</summary>
          <div>
            <DeleteButton
              courseId={course._id}
              variant="page"
              onDeleted={onDeleted}
            />
          </div>
        </details>
      </div>
      <h3>
        <Link to={`/courses/${course._id}`}>{course.title}</Link>
      </h3>
      {course.description && (
        <p className="learning-description">{course.description}</p>
      )}
      <div className="learning-card-progress">
        <div>
          <span>
            {completed} of {total} lessons completed
          </span>
          <span>{percent}%</span>
        </div>
        <progress
          max={total || 1}
          value={completed}
          aria-label={`Completion for ${course.title}`}
        />
      </div>
      <div className="learning-card-actions">
        <Link className="learning-button" to={action.to}>
          {action.label} →
        </Link>
        {course.resumeLessonId && !finished && (
          <Link className="learning-link" to={`/courses/${course._id}`}>
            View outline
          </Link>
        )}
      </div>
    </article>
  );
}
