import { useCourses } from '../hooks/useCourses.js';
import StatCell from '../components/StatCell.jsx';
import CourseRow from '../components/CourseRow.jsx';
import StateMessage from '../components/StateMessage.jsx';
import PromptForm from '../components/PromptForm.jsx';

/**
 * GET /api/courses — the library.
 *
 * The first real screen, and deliberately the simplest: one request, no state
 * of its own. If this renders, the base URL, CORS, the error envelope and the
 * hooks are all proven at once.
 *
 * From the design, top to bottom:
 *   h1     "My courses"
 *   sub    "Everything you have generated. Lessons are written when you open
 *           them, so a course can be complete on paper and mostly unwritten."
 *   prompt box            (placeholder until Task 5.6)
 *   3 stat cells          Courses / Lessons / Written (12 / 51)
 *   header row            #(26px) · Course(flex) · Written(96px) · Created(74px)
 *   one CourseRow each
 */
export default function LibraryPage() {
  // 1. const { data, loading, error } = useCourses();

  const { data, loading, error, refetch } = useCourses();

  // 2. THREE STATES BEFORE ANY MARKUP — handle them first and return early.
  //    Each one means `data` is not safe to read, and `data.totals` on the
  //    first render is the classic crash here.
  //
  //      loading    → <StateMessage kind="loading" ... />
  //      error      → <StateMessage kind="error" title={error.message} />
  //      no courses → <StateMessage kind="empty" ... /> AND the prompt box,
  //                   because an empty library with no way to create anything
  //                   is a dead end — and it is the first screen a new account
  //                   sees.

  if (loading) {
    return <StateMessage kind="loading" title="Loading your courses…" />;
  }

  if (error) {
    return (
      <StateMessage
        kind="error"
        title={error.message}
        detail={error.code === 'network_error' ? 'Start the server and reload.' : undefined}
      />
    );
  }

  const { totals, courses } = data;

  // Placeholder until Task 5.6 builds the real PromptForm. Not a <form> and not
  // wired to anything — it holds the space and shows what belongs here.
  const promptBox = (
    <div className="mb-[18px]">
      <PromptForm variant="inline" />
    </div>
  );

  const heading = (
    <>
      <h1 className="mb-[5px] text-[23px] font-bold tracking-[-0.022em]">My courses</h1>
      <p className="mb-4 max-w-[62ch] text-[13px] leading-[1.55] text-[#5b6470]">
        Everything you have generated. Lessons are written when you open them, so a course can
        be complete on paper and mostly unwritten.
      </p>
    </>
  );

  if (courses.length === 0) {
    return (
      <>
        {heading}
        {promptBox}
        <StateMessage
          kind="empty"
          title="No courses yet"
          detail="Name a topic above and the outline comes back in about six seconds."
        />
      </>
    );
  }

  // 3. The header row must use the SAME four widths as CourseRow
  //    (26 / flex / 96 / 74), or the labels drift out of line with the columns.
  //    That duplication is a real risk of drift — if it bothers you, export the
  //    widths as one shared constant from CourseRow and use it in both.
  //
  // 4. Written takes `of`:  <StatCell label="Written" value={totals.written}
  //                                    of={totals.lessons} />
  //
  // 5. THE SIDEBAR IS NOT THIS PAGE'S JOB — yet.
  //    AppLayout renders <Sidebar /> with no children, so the rail is empty.
  //    Leave it empty for now.
  //
  //    This page cannot fix that: it renders inside AppLayout's <Outlet />, so
  //    it cannot pass children up to a sidebar that already rendered above it.
  //    The fix is for AppLayout to own the course list itself — every page in
  //    the shell wants the same list. We will do that deliberately once you
  //    have seen the wall.
  //
  //    Two things in the design's rail have NO data behind them, so skip both:
  //      "Recently opened" — nothing tracks it (could derive from updatedAt)
  //      "jagan@dev"       — no auth until Phase 8
  //    The rail footer's "4 courses · 51 lessons" IS real: it is `totals`.

  return (
    <>
      {heading}
      {promptBox}

      <div className="mb-5 grid grid-cols-3 gap-px border border-line bg-line">
        <StatCell label="Courses" value={totals.courses} />
        <StatCell label="Lessons" value={totals.lessons} />
        <StatCell label="Written" value={totals.written} of={totals.lessons} />
      </div>

      <div className="flex gap-[11px] border-b border-line pb-[6px] pr-[20px] font-mono text-[8.5px] uppercase tracking-[0.13em] text-[#8b95a1]">
        <span className="w-[26px] shrink-0">#</span>
        <span className="min-w-0 flex-1">Course</span>
        <span className="w-[96px] shrink-0 text-right">Written</span>
        <span className="w-[74px] shrink-0 text-right">Created</span>
      </div>

      {courses.map((course, i) => (
        // refetch rather than dropping the row locally: the three stat cells
        // above are server-computed totals, and a local removal would leave
        // them claiming a lesson count that no longer exists.
        <CourseRow key={course._id} index={i + 1} course={course} onDeleted={refetch} />
      ))}
    </>
  );
}
