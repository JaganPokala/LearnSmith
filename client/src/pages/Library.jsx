import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCourses } from '../hooks/useCourses.js';
import StatCell from '../components/StatCell.jsx';
import CourseRow from '../components/CourseRow.jsx';
import StateMessage from '../components/StateMessage.jsx';
import PromptForm from '../components/PromptForm.jsx';
import { SidebarSection, SidebarItem, SidebarFooter } from '../components/Sidebar.jsx';
import { useAuth, AUTH_ENABLED } from '../lib/auth.js';

/**
 * GET /api/courses — the library.
 *
 *   h1                    "My courses"
 *   prompt box
 *   3 stat cells          Courses / Lessons / Written
 *   header row            # · Course · Written · Created
 *   one CourseRow each
 */
export default function LibraryPage() {
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect } = useAuth();

  // The request is held until we know who is asking. On a cold load the token
  // is not ready for the first render or two, and firing early earns a 401 the
  // page would then have to take back.
  const { data, loading, error, refetch } = useCourses(isAuthenticated);

  // Declared before the early returns: hooks must run in the same order on
  // every render.
  const { setRail } = useOutletContext();

  useEffect(() => {
    if (!data?.courses?.length) return undefined;

    setRail(
      <>
        <SidebarSection label="Your courses">
          {data.courses.map((course) => (
            // `end` so /courses does not count as active for every course under
            // it — without it every row in the rail highlights at once.
            <SidebarItem key={course._id} to={`/courses/${course._id}`} end>
              {course.title}
            </SidebarItem>
          ))}
        </SidebarSection>

        <SidebarFooter>
          {data.totals.courses} courses · {data.totals.lessons} lessons
        </SidebarFooter>
      </>,
    );

    return () => setRail(null);
  }, [data, setRail]);

  // ---------------------------------------------------------------- signed out
  // This route is the only private one in the app, and the server fails CLOSED:
  // it 401s when auth is unconfigured rather than serving the shared guest
  // library, which is the one list that must never be shown. So the page has to
  // answer for that case too, or an unconfigured deployment looks broken.
  if (authLoading) {
    return <StateMessage kind="loading" title="Checking your session…" />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <h1 className="mb-[5px] text-title font-bold tracking-[-0.022em]">Your library</h1>

        <StateMessage
          kind="empty"
          title={AUTH_ENABLED ? 'Sign in to see your courses' : 'Sign-in is not configured'}
          detail={
            AUTH_ENABLED
              ? 'Your library is private. Courses you generate without an account are for trying it out — they are not saved to one.'
              : 'This deployment has no Auth0 credentials set, so there is no account to sign in to. The library stays closed rather than showing every visitor the shared guest courses.'
          }
          action={
            AUTH_ENABLED ? (
              <button
                type="button"
                onClick={() => loginWithRedirect()}
                className="border border-accent-line bg-accent-bg px-[13px] py-[6px] text-sm font-semibold text-glow hover:border-glow hover:bg-raised"
              >
                Sign in →
              </button>
            ) : undefined
          }
        />
      </>
    );
  }

  // Three states before any markup, each meaning `data` is not safe to read.
  // `data.totals` on the first render is the classic crash here.
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

  // Auth just resolved and the first fetch has not landed yet.
  if (!data) return <StateMessage kind="loading" title="Loading your courses…" />;

  const { totals, courses } = data;

  const heading = (
    <>
      <h1 className="mb-[5px] text-title font-bold tracking-[-0.022em]">My courses</h1>
      <p className="mb-4 max-w-[62ch] text-base leading-[1.55] text-dim">
        Everything you have generated. Lessons are written when you open them, so a course can
        be complete on paper and mostly unwritten.
      </p>
    </>
  );

  const promptBox = (
    <div className="mb-[18px]">
      <PromptForm variant="inline" />
    </div>
  );

  // An empty library with no way to create anything is a dead end, and it is
  // the first screen a new account sees — so the prompt box stays.
  if (courses.length === 0) {
    return (
      <>
        {heading}
        {promptBox}
        <StateMessage
          kind="empty"
          title="No courses yet"
          detail="Name a topic above and the outline comes back in about seven seconds."
        />
      </>
    );
  }

  return (
    <>
      {heading}
      {promptBox}

      <div className="mb-5 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3">
        <StatCell label="Courses" value={totals.courses} />
        <StatCell label="Lessons" value={totals.lessons} />
        <StatCell label="Written" value={totals.written} of={totals.lessons} />
      </div>

      <div className="border border-line">
        {/* The same four widths, the same padding and the same breakpoint as
            CourseRow, or the labels drift out of line with the columns below
            them. Written is hidden under 640px: at 375px the fixed columns and
            their gaps eat 249 of 343 available pixels, leaving 94px for the
            title. */}
        <div className="flex gap-[11px] border-b border-line bg-panel py-[8px] pl-[13px] pr-[33px] font-mono text-xs uppercase tracking-[0.13em] text-mute">
          <span className="w-[26px] shrink-0">#</span>
          <span className="min-w-0 flex-1">Course</span>
          <span className="hidden w-[96px] shrink-0 text-right sm:block">Written</span>
          <span className="w-[74px] shrink-0 text-right">Created</span>
        </div>

        {courses.map((course, i) => (
          // refetch rather than dropping the row locally: the three stat cells
          // above are server-computed totals, and a local removal would leave
          // them claiming a lesson count that no longer exists.
          <CourseRow key={course._id} index={i + 1} course={course} onDeleted={refetch} />
        ))}
      </div>
    </>
  );
}
