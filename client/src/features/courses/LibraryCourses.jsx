import { useId, useState } from "react";
import { Link } from "react-router-dom";
import CourseCard from "./CourseCard.jsx";
import { courseCompletion } from "./coursePresentation.js";

export default function LibraryCourses({ courses, onDeleted }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const searchId = useId();
  const sortId = useId();
  const continuing = courses
    .filter(
      (course) => course.resumeLessonId && !courseCompletion(course).finished,
    )
    .slice(0, 3);
  const filtered = courses
    .filter((course) =>
      course.title.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "progress")
        return courseCompletion(b).percent - courseCompletion(a).percent;
      return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
    });

  return (
    <>
      {continuing.length > 0 && (
        <section className="learning-continue" aria-labelledby="continue-title">
          <div>
            <p className="learning-eyebrow">Your next step</p>
            <h2 id="continue-title">Continue learning</h2>
            <p>Return to a course’s last-opened lesson.</p>
          </div>
          <ul>
            {continuing.map((course) => (
              <li key={course._id}>
                <Link to={`/lessons/${course.resumeLessonId}`}>
                  <span>{course.title}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="all-courses-title">
        <div className="learning-toolbar">
          <h2 id="all-courses-title">
            Your courses <span>({courses.length})</span>
          </h2>
          <div className="learning-filters">
            <div>
              <label htmlFor={searchId}>Search courses</label>
              <input
                id={searchId}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by title"
              />
            </div>
            <div>
              <label htmlFor={sortId}>Sort by</label>
              <select
                id={sortId}
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="newest">Newest created</option>
                <option value="title">Title A–Z</option>
                <option value="progress">Most completed</option>
              </select>
            </div>
          </div>
        </div>
        <p role="status" className="learning-result-count">
          {filtered.length} {filtered.length === 1 ? "course" : "courses"}
          {search.trim() ? " matching your search" : ""}
        </p>
        {filtered.length ? (
          <div className="learning-course-grid">
            {filtered.map((course) => (
              <CourseCard
                key={course._id}
                course={course}
                onDeleted={onDeleted}
              />
            ))}
          </div>
        ) : (
          <div className="learning-empty">
            <h3>No matching courses</h3>
            <p>Try a different title or clear your search.</p>
            <button
              className="learning-button secondary"
              onClick={() => setSearch("")}
            >
              Clear search
            </button>
          </div>
        )}
      </section>
    </>
  );
}
