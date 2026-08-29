import { useParams, useNavigate } from 'react-router-dom';
import { useCourse } from '../hooks/useCourse.js';
import { timeAgo } from '../lib/formatDate.js';
import MetaBar from '../components/MetaBar.jsx';
import ModuleSection from '../components/ModuleSection.jsx';
import StateMessage from '../components/StateMessage.jsx';
import DeleteButton from '../components/DeleteButton.jsx';

/**
 * GET /api/courses/:id — one course.
 *
 * From the design, top to bottom:
 *   courses / <title>                              breadcrumb
 *   <h1>                                           title
 *   <p>                                            description
 *   [N modules] N lessons · N written · created …  MetaBar
 *   1 · Module title                               ModuleSection ×N
 *     01  Lesson title            [built]
 */
export default function CoursePage() {
  // 1. const { courseId } = useParams()
  //
  //    THE NAME MUST MATCH THE ROUTE. main.jsx declares "/courses/:courseId",
  //    so it is courseId here. A mismatch gives undefined, which becomes a
  //    request to /api/courses/undefined and a 400 invalid_id — an error that
  //    points at the id rather than at the typo that caused it.

  const { courseId } = useParams();

  // 2. const { data: course, loading, error } = useCourse(courseId)

  const { data: course, loading, error } = useCourse(courseId);

  // Declared before the early returns below: hooks must run in the same order
  // on every render, and a useNavigate() sitting after `if (loading) return`
  // would be skipped on the first render and called on the next.
  const navigate = useNavigate();

  // 3. Handle loading / error / missing BEFORE reading `course`.
  //
  //    This is the first page where the user meets your error codes, so branch
  //    on error.code rather than showing one generic message. That branching is
  //    exactly what unwrapping the envelope in api.js bought you:
  //
  //      invalid_id        → "That does not look like a course link."
  //      course_not_found  → "This course does not exist, or was deleted."
  //      network_error     → error.message already says it
  //      anything else     → error.message
  //
  //    Use <StateMessage kind="error" ... /> for all of them.

  if (loading) {
    return <StateMessage kind="loading" title="Loading the course…" />;
  }

  if (error) {
    const TITLES = {
      invalid_id: 'That does not look like a course link.',
      course_not_found: 'This course does not exist, or was deleted.',
    };

    return <StateMessage kind="error" title={TITLES[error.code] ?? error.message} />;
  }

  // Not loading, no error, still nothing: only reachable if the request
  // resolved with an empty body. Guarded so the reads below cannot be the
  // thing that crashes.
  if (!course) {
    return <StateMessage kind="error" title="This course does not exist, or was deleted." />;
  }

  // 4. DERIVE THE COUNTS — they are not in the response, and do not need to be.
  //    The list endpoint needed server-side counts because it sends no lessons;
  //    here you hold every lesson already.
  //
  //      moduleCount  = course.modules.length
  //      lessonCount  = sum of each module's lessons.length
  //      writtenCount = how many of those have isEnriched
  //
  //    Guard `module.lessons` — a half-saved module can have none.

  const modules = course.modules ?? [];

  const moduleCount = modules.length;

  const lessonCount = modules.reduce(
    (total, module) => total + (module.lessons?.length ?? 0),
    0,
  );

  const writtenCount = modules.reduce(
    (total, module) => total + (module.lessons?.filter((lesson) => lesson.isEnriched).length ?? 0),
    0,
  );

  // 5. THE COURSE-WIDE LESSON NUMBER.
  //    Each ModuleSection needs the number its FIRST lesson should carry:
  //    module 1 starts at 1, module 2 starts at 1 + module 1's lesson count,
  //    and so on. Compute a running total as you map over the modules.
  //
  //    Doing this per module (i + 1 inside each) restarts every module at 01
  //    and makes one syllabus read as several separate lists.

  // Derived rather than accumulated in a mutable counter: each module's start
  // is one past the total of every module before it. The `?? 0` matters — one
  // module without lessons would otherwise turn every later number into NaN.
  const sections = modules.map((module, i) => ({
    module,
    startNumber:
      modules.slice(0, i).reduce((total, m) => total + (m.lessons?.length ?? 0), 0) + 1,
  }));

  return (
    <>
      {/* 6. The breadcrumb: the design shows "courses / react-hooks", a slug we
             do not have. Use the title instead rather than inventing slugs,
             which would be a backend change for cosmetics. */}
      <p className="mb-[9px] font-mono text-[10px] text-[#8b95a1]">courses / {course.title}</p>

      <h1 className="mb-[5px] text-[23px] font-bold tracking-[-0.022em]">{course.title}</h1>

      {course.description && (
        <p className="mb-4 max-w-[62ch] text-[13px] leading-[1.55] text-[#5b6470]">
          {course.description}
        </p>
      )}

      {/* 7. MetaBar, with the delete action on the right (Task 5.10).
             `replace: true` rather than a plain navigate: the course this URL
             points at no longer exists, so leaving it in the history means the
             Back button lands on a 404. */}
      <MetaBar
        pill={`${moduleCount} modules`}
        stats={[
          `${lessonCount} lessons`,
          `${writtenCount} written`,
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

      {/* 9. A course with zero modules should say so, not render an empty page. */}
      {sections.length === 0 ? (
        <StateMessage
          kind="empty"
          title="This course has no modules"
          detail="The outline did not save completely. Generating the topic again is the quickest fix."
        />
      ) : (
        // 8. Key on module._id, not the array index: keying by index makes
        //    React reuse the wrong DOM when a list reorders.
        sections.map(({ module, startNumber }, i) => (
          <ModuleSection
            key={module._id}
            number={i + 1}
            module={module}
            startNumber={startNumber}
          />
        ))
      )}
    </>
  );
}
