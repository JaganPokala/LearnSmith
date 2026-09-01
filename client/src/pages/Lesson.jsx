import { useEffect } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { useLesson } from '../hooks/useLesson.js';
import { useGenerateLesson } from '../hooks/useGenerateLesson.js';
import { SidebarSection, SidebarItem, SidebarDot } from '../components/Sidebar.jsx';
import StateMessage from '../components/StateMessage.jsx';
import LessonRenderer from '../components/blocks/LessonRenderer.jsx';
import LessonSkeleton from '../components/LessonSkeleton.jsx';
import AudioPlayer from '../components/AudioPlayer.jsx';
import { describeError } from '../lib/errors.js';
import { stripEchoedTitle } from '../lib/lessonBody.js';
import RetryButton from '../components/RetryButton.jsx';
import { useAuth } from '../lib/auth.js';

/**
 * One measure for the whole article. The objectives box, the skeleton and the
 * blocks all take it, so nothing spans the page while the prose beside it stops
 * two thirds of the way across.
 */
const MEASURE = 'max-w-[720px]';

/**
 * GET /api/lessons/:id, plus the POST that writes it.
 *
 * Five states, in the order they must be checked:
 *
 *   loading      → useLesson is still fetching
 *   error        → useLesson failed
 *   generating   → THIS lesson is being written
 *   not-written  → lesson.isEnriched === false → the write prompt
 *   written      → objectives + blocks
 *
 * The order is not cosmetic: loading and error must both be handled before
 * anything reads `data.lesson`, or an errored page crashes on a property of
 * null instead of showing the message written for it.
 */
export default function LessonPage() {
  const { lessonId } = useParams();

  // Held until auth settles, for the same reason as the course page: a
  // tokenless reload of your own lesson is a 404.
  const { isLoading: authLoading } = useAuth();

  const { data, loading, error, applyGeneratedLesson } = useLesson(lessonId, !authLoading);
  const { run, pendingId, failure, reset } = useGenerateLesson();

  const { setRail } = useOutletContext();

  // F3: this component does not unmount when you move between siblings, so both
  // of these must be asked about THIS lesson rather than read as bare flags.
  // Otherwise the sibling you navigate to shows a spinner, or a red message,
  // for a write that was never its own.
  const writing = pendingId === lessonId;
  const writeError = failure?.lessonId === lessonId ? failure.error : null;

  // setRail is called from an effect, never from the render body: setting parent
  // state during a child's render re-renders the parent, which re-renders the
  // child, which sets state again. The deps are DATA, not JSX — a JSX array
  // would be a new element object every render and the effect would never
  // settle. The cleanup stops a lesson's module hanging around in the rail
  // after you navigate to the library.
  useEffect(() => {
    if (!data) return;

    setRail(
      <>
        <SidebarSection label="Course">
          <SidebarItem to={`/courses/${data.course?._id}`}>{data.course?.title}</SidebarItem>
        </SidebarSection>

        <SidebarSection label={data.module?.title}>
          {data.siblings?.map((sibling) => (
            <SidebarItem key={sibling._id} to={`/lessons/${sibling._id}`}>
              <SidebarDot isEnriched={sibling.isEnriched} />
              {sibling.title}
            </SidebarItem>
          ))}
        </SidebarSection>
      </>,
    );

    return () => setRail(null);
  }, [data, setRail]);

  // POST returns the lesson ONLY — no siblings, no module, no course — so
  // applyGeneratedLesson merges it locally. isEnriched is not set by hand: the
  // lesson coming back already carries it, so a server that somehow returned an
  // unenriched lesson shows the write prompt again rather than a blank page
  // claiming to be written.
  async function handleWrite() {
    if (writeError) reset();

    const lesson = await run(lessonId);

    if (!lesson) return;

    applyGeneratedLesson(lesson);
  }

  if (loading) {
    return <StateMessage kind="loading" title="Loading the lesson…" />;
  }

  if (error) {
    const { title, detail, retry } = describeError(error, 'lesson');

    return (
      <StateMessage
        kind="error"
        title={title}
        detail={detail}
        action={retry ? <RetryButton onClick={() => window.location.reload()} /> : undefined}
      />
    );
  }

  // Not reachable today; costs one line and means a future change to the hook
  // cannot produce a blank screen.
  if (!data) {
    return <StateMessage kind="error" title="This lesson does not exist, or was deleted." />;
  }

  const { lesson, course, module, position, total } = data;

  const body = stripEchoedTitle(lesson.content, lesson.title);

  // Shown in all three remaining states, so it sits above the branch. It is the
  // reason the twelve-second wait is tolerable: the user is looking at a real
  // page with a title, not a spinner.
  const header = (
    <>
      <p className="mb-[9px] font-mono text-meta text-mute">
        <Link to={`/courses/${course?._id}`} className="hover:text-accent">
          {course?.title}
        </Link>
        {module?.title ? ` / ${module.title}` : ''}
        {position != null ? ` / lesson ${position} of ${total}` : ''}
      </p>

      <div className="mb-4 flex items-start gap-3">
        <h1 className="min-w-0 flex-1 text-title font-bold tracking-[-0.022em]">{lesson.title}</h1>

        {/* window.print() rather than a PDF library: the browser already knows
            how to paginate without cutting a line in half, and its "Save as
            PDF" produces real selectable text. A screenshot-based export would
            add ~550kB to the bundle to produce a picture of this page. */}
        {lesson.isEnriched && (
          <button
            type="button"
            onClick={() => window.print()}
            title="Opens your print dialog — choose 'Save as PDF'"
            className="mt-[6px] shrink-0 border border-line bg-panel px-[11px] py-[5px] font-mono text-xs text-dim hover:border-accent hover:text-accent print:hidden"
          >
            ⇩ pdf
          </button>
        )}
      </div>
    </>
  );

  // Checked BEFORE isEnriched: the lesson is still isEnriched:false during the
  // twelve seconds, so testing isEnriched first would keep the write button on
  // screen for the whole call.
  if (writing) {
    return (
      <>
        {header}

        <div className={MEASURE}>
          {/* A banner on the article's own measure, not a card floating in an
              empty page. The bar is indeterminate on purpose: the server
              reports no stage, and generation latency genuinely varies, so a
              percentage would have to be invented. */}
          <div
            role="status"
            aria-live="polite"
            className="mb-[18px] border border-line border-l-2 border-l-accent bg-panel px-[13px] py-[11px]"
          >
            <p className="m-0 text-base font-semibold text-ink">Writing this lesson…</p>

            <p className="m-0 mt-[3px] text-sm leading-[1.55] text-dim">
              Usually eight to thirteen seconds. The text, code and questions are being written
              now, and saved so the next visit is instant.
            </p>

            <div className="mt-[11px] h-[2px] w-full overflow-hidden bg-line">
              <div className="h-full w-1/4 animate-slide bg-accent" />
            </div>
          </div>

          <LessonSkeleton />
        </div>
      </>
    );
  }

  if (!lesson.isEnriched) {
    return (
      <>
        {header}
        <StateMessage
          kind="empty"
          title="This lesson has not been written yet"
          detail="Lessons are written when you open them, so you only wait for the ones you actually read."
          action={
            <>
              {writeError && (
                <p role="alert" className="mb-3 text-sm text-danger">
                  {writeError.message}
                </p>
              )}

              <button
                type="button"
                onClick={handleWrite}
                // Disabled for ANY write in flight, not just this lesson's: the
                // hook serialises them, so a second click would silently do
                // nothing and read as a dead button.
                disabled={pendingId !== null}
                className="border border-accent-line bg-accent-bg px-[13px] py-[6px] text-sm font-semibold text-glow hover:border-glow hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingId ? 'Another lesson is being written…' : 'Write this lesson →'}
              </button>
            </>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}

      <div className={MEASURE}>
      {/* Above the objectives: someone who wants to listen rather than read
          should not have to scroll the whole lesson to find that out. */}
      {/* Keyed so a move between sibling lessons REMOUNTS it. Without the
          key the component is reused, and it would show the previous lesson's
          recording under the new lesson's title — F3 all over again, in audio. */}
      <AudioPlayer key={lessonId} lessonId={lessonId} />

      {/* Nothing at all when the array is empty — an empty labelled box looks
          like a rendering bug. */}
      {lesson.objectives?.length > 0 && (
        <div className="mb-[18px] border border-line border-l-2 border-l-accent bg-panel px-[13px] py-[11px]">
          <div className="mb-[6px] font-mono text-xs uppercase tracking-[0.13em] text-glow">
            You will be able to
          </div>

          <ul className="m-0 list-disc pl-4">
            {lesson.objectives.map((objective) => (
              <li key={objective} className="mb-[3px] text-base leading-[1.5] text-body">
                {objective}
              </li>
            ))}
          </ul>
        </div>
      )}

        <LessonRenderer blocks={body} />
      </div>
    </>
  );
}
