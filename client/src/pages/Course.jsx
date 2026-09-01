import { useEffect, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useCourse } from '../hooks/useCourse.js';
import { timeAgo } from '../lib/formatDate.js';
import MetaBar from '../components/MetaBar.jsx';
import ModuleSection from '../components/ModuleSection.jsx';
import StateMessage from '../components/StateMessage.jsx';
import { describeError } from '../lib/errors.js';
import RetryButton from '../components/RetryButton.jsx';
import { useAuth } from '../lib/auth.js';
import DeleteButton from '../components/DeleteButton.jsx';
import {
  SidebarSection,
  SidebarItem,
  SidebarDot,
  SidebarFooter,
} from '../components/Sidebar.jsx';

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
  const { isLoading: authLoading } = useAuth();

  const { data: course, loading, error } = useCourse(courseId, !authLoading);

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
        (total, m) => total + (m.lessons?.filter((l) => l.isEnriched).length ?? 0),
        0,
      ),
      // Each module's first lesson number is one past the total of every module
      // before it. Numbering per module instead restarts every module at 01 and
      // makes one syllabus read as several separate lists.
      sections: modules.map((module, i) => ({
        module,
        startNumber: modules.slice(0, i).reduce((total, m) => total + count(m), 0) + 1,
      })),
    };
  }, [course]);

  useEffect(() => {
    if (!course) return;

    setRail(
      <>
        {outline.sections.map(({ module }, i) => (
          <SidebarSection key={module._id} label={`${i + 1} · ${module.title}`}>
            {module.lessons?.map((lesson) => (
              <SidebarItem key={lesson._id} to={`/lessons/${lesson._id}`}>
                <SidebarDot isEnriched={lesson.isEnriched} />
                {lesson.title}
              </SidebarItem>
            ))}
          </SidebarSection>
        ))}

        <SidebarFooter>
          {outline.lessonCount} lessons · {outline.writtenCount} written
        </SidebarFooter>
      </>,
    );

    return () => setRail(null);
  }, [course, outline, setRail]);

  if (loading) {
    return <StateMessage kind="loading" title="Loading the course…" />;
  }

  if (error) {
    // One shared table (lib/errors.js) rather than a local list per page: the
    // same code has to mean the same thing everywhere, and `retry` decides
    // whether a button is even honest advice.
    const { title, detail, retry } = describeError(error, 'course');

    return (
      <StateMessage
        kind="error"
        title={title}
        detail={detail}
        action={retry ? <RetryButton onClick={() => window.location.reload()} /> : undefined}
      />
    );
  }

  // Not loading, no error, still nothing: only reachable if the request
  // resolved with an empty body.
  if (!course) {
    return <StateMessage kind="error" title="This course does not exist, or was deleted." />;
  }

  return (
    <>
      <p className="mb-[9px] font-mono text-meta text-mute">courses / {course.title}</p>

      <h1 className="mb-[5px] text-title font-bold tracking-[-0.022em]">{course.title}</h1>

      {course.description && (
        <p className="mb-4 max-w-[62ch] text-base leading-[1.55] text-dim">
          {course.description}
        </p>
      )}

      {/* `replace: true` rather than a plain navigate: the course this URL
          points at no longer exists, so leaving it in the history means the Back
          button lands on a 404. */}
      <MetaBar
        pill={`${outline.moduleCount} modules`}
        stats={[
          `${outline.lessonCount} lessons`,
          `${outline.writtenCount} written`,
          `created ${timeAgo(course.createdAt)}`,
        ]}
        action={
          <DeleteButton
            courseId={course._id}
            variant="page"
            onDeleted={() => navigate('/courses', { replace: true })}
          />
        }
      />

      {outline.sections.length === 0 ? (
        <StateMessage
          kind="empty"
          title="This course has no modules"
          detail="The outline did not save completely. Generating the topic again is the quickest fix."
        />
      ) : (
        // Keyed on module._id, not the array index: keying by index makes React
        // reuse the wrong DOM when a list reorders.
        outline.sections.map(({ module, startNumber }, i) => (
          <ModuleSection key={module._id} number={i + 1} module={module} startNumber={startNumber} />
        ))
      )}
    </>
  );
}
