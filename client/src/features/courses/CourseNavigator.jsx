import { Link, NavLink } from "react-router-dom";

export default function CourseNavigator({ course, completedLessonIds = [] }) {
  return (
    <nav className="course-navigator" aria-label="Course navigation">
      <Link className="outline-back" to="/courses">
        ← My learning
      </Link>
      <p className="workspace-label">Current course</p>
      <Link className="outline-course-title" to={`/courses/${course._id}`}>
        {course.title}
      </Link>
      <NavLink className="outline-overview" to={`/courses/${course._id}`} end>
        Course overview <span aria-hidden="true">↗</span>
      </NavLink>
      {course.modules?.map((module, index) => (
        <section key={module._id} className="outline-module">
          <h2>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {module.title}
          </h2>
          <ol>
            {module.lessons?.map((lesson) => (
              <li key={lesson._id}>
                <NavLink to={`/lessons/${lesson._id}`}>
                  <span className="outline-dot" aria-hidden="true">
                    {completedLessonIds.includes(String(lesson._id))
                      ? "✓"
                      : lesson.isEnriched
                        ? "●"
                        : "○"}
                  </span>
                  <span>{lesson.title}</span>
                </NavLink>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="outline-legend">
        ● Ready to read · ○ Not generated · ✓ Completed
      </p>
    </nav>
  );
}
