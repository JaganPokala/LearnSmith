import { useEffect, useMemo } from "react";
import {
  useParams,
  useNavigate,
  useOutletContext,
  Link,
} from "react-router-dom";
import { useCourse } from "../hooks/useCourse.js";
import ModuleSection from "../components/ModuleSection.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { describeError } from "../lib/errors.js";
import RetryButton from "../components/RetryButton.jsx";
import { useAuth } from "../lib/auth.js";
import CourseOverview from "../features/courses/CourseOverview.jsx";
import { useCourseProgress } from "../hooks/useCourseProgress.js";
import CourseNavigator from "../features/courses/CourseNavigator.jsx";

/**
 * GET /api/courses/:id — one course.
 *
 *   courses / <title>                              breadcrumb
 *   <h1>                                           title
 *   <p>                                            description
 *   [N modules] N lessons · N written · created …  MetaBar
 *   1 · Module title                               ModuleSection ×N
 *     01  Lesson title            [built]
 */
export default function CoursePage() {
  // The name must match the route: main.jsx declares "/courses/:courseId". A
  // mismatch gives undefined, which becomes a request to /api/courses/undefined
  // and a 400 that points at the id rather than at the typo behind it.
  const { courseId } = useParams();

  // Held until auth settles, or a reload of a signed-in user's own course
  // goes out tokenless and comes back 404.
  const { isLoading: authLoading, user } = useAuth();

  const { data: course, loading, error } = useCourse(courseId, !authLoading);
  const progress = useCourseProgress(
    courseId,
    !authLoading,
    user?.sub ?? "guest",
  );

  // Every hook is declared before the early returns below: hooks must run in
  // the same order on every render, and one sitting after `if (loading) return`
  // would be skipped on the first render and called on the next.
  const navigate = useNavigate();
  const { setRail } = useOutletContext();

  // The counts are not in the response and do not need to be — the list
  // endpoint needed server-side counts because it sends no lessons; here every
  // lesson is already in hand. Memoised so the rail effect below has one stable
  // dependency instead of re-running on every render.
  const outline = useMemo(() => {
    const modules = course?.modules ?? [];

    const count = (module) => module.lessons?.length ?? 0;

    return {
      modules,
      moduleCount: modules.length,
      lessonCount: modules.reduce((total, m) => total + count(m), 0),
      writtenCount: modules.reduce(
        (total, m) =>
          total + (m.lessons?.filter((l) => l.isEnriched).length ?? 0),
        0,
      ),
      // Each module's first lesson number is one past the total of every module
      // before it. Numbering per module instead restarts every module at 01 and
      // makes one syllabus read as several separate lists.
      sections: modules.map((module, i) => ({
        module,
        startNumber:
          modules.slice(0, i).reduce((total, m) => total + count(m), 0) + 1,
      })),
    };
  }, [course]);

  useEffect(() => {
    if (!course) return;
    setRail(
      <CourseNavigator
        course={course}
        completedLessonIds={progress.data?.completedLessonIds}
      />,
    );
    return () => setRail(null);
  }, [course, progress.data, setRail]);

  if (loading) {
    return <StateMessage kind="loading" title="Loading the course…" />;
  }

  if (error) {
    // One shared table (lib/errors.js) rather than a local list per page: the
    // same code has to mean the same thing everywhere, and `retry` decides
    // whether a button is even honest advice.
    const { title, detail, retry } = describeError(error, "course");

    return (
      <StateMessage
        kind="error"
        title={title}
        detail={detail}
        action={
          retry ? (
            <RetryButton onClick={() => window.location.reload()} />
          ) : undefined
        }
      />
    );
  }

  // Not loading, no error, still nothing: only reachable if the request
  // resolved with an empty body.
  if (!course) {
    return (
      <StateMessage
        kind="error"
        title="This course does not exist, or was deleted."
      />
    );
  }

  const firstLesson = outline.modules.flatMap(
    (module) => module.lessons ?? [],
  )[0];
  const saved = progress.data;

  return (
    <div className="learning-page">
      <Link className="learning-link" to="/courses">
        ← My learning
      </Link>
      <CourseOverview
        course={course}
        moduleCount={outline.moduleCount}
        lessonCount={outline.lessonCount}
        writtenCount={outline.writtenCount}
        progress={progress}
        firstLesson={firstLesson}
        onDeleted={() => navigate("/courses", { replace: true })}
      />
      <h2 className="course-outline-heading">Course outline</h2>
      <p className="learning-helper">
        Content generation and lesson completion are separate. Mark lessons
        complete as you work through them.
      </p>
      {outline.sections.length === 0 ? (
        <StateMessage
          kind="empty"
          title="This outline has no lessons yet."
          detail="Try reloading the course before deciding whether to create another outline."
        />
      ) : (
        outline.sections.map(({ module, startNumber }, i) => (
          <ModuleSection
            key={module._id}
            number={i + 1}
            module={module}
            startNumber={startNumber}
            completedLessonIds={saved?.completedLessonIds}
          />
        ))
      )}
    </div>
  );
}
