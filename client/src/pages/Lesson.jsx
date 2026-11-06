import { useEffect } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { useLesson } from '../hooks/useLesson.js';
import { useGenerateLesson } from '../hooks/useGenerateLesson.js';
import { SidebarSection, SidebarItem, SidebarDot } from '../components/Sidebar.jsx';
import StateMessage from '../components/StateMessage.jsx';
import LessonReader from '../components/LessonReader.jsx';
import LessonSkeleton from '../components/LessonSkeleton.jsx';
import { describeError } from '../lib/errors.js';
import RetryButton from '../components/RetryButton.jsx';
import { useAuth } from '../lib/auth.js';
import { useFeatures } from '../hooks/useFeatures.js';
import { useLessonLearning } from '../hooks/useLessonLearning.js';
import { LearningContext } from '../lib/learningContext.js';

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
  const { isLoading: authLoading, user } = useAuth();
  const features = useFeatures();

  const { data, loading, error, statusError, checkStatus, applyGeneratedLesson } = useLesson(lessonId, !authLoading);
  const { run, pendingId, failure, reset } = useGenerateLesson({ checkStatus });
  const learning = useLessonLearning(lessonId, !authLoading && String(data?.lesson?._id) === lessonId,
    Boolean(data?.lesson?.isEnriched), user?.sub ?? 'guest');

  const { setRail } = useOutletContext();

  // F3: this component does not unmount when you move between siblings, so both
  // of these must be asked about THIS lesson rather than read as bare flags.
  // Otherwise the sibling you navigate to shows a spinner, or a red message,
  // for a write that was never its own.
  const watching = data?.generation?.state === 'generating' && !data?.lesson?.isEnriched;
  const writing = pendingId === lessonId || watching;
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
        action={retry || ['network_error', 'database_unavailable'].includes(error.code) ? <RetryButton onClick={checkStatus} /> : undefined}
      />
    );
  }

  // Not reachable today; costs one line and means a future change to the hook
  // cannot produce a blank screen.
  if (!data) {
    return <StateMessage kind="error" title="This lesson does not exist, or was deleted." />;
  }

  const { lesson, course, module, position, total } = data;

  const siblings = data.siblings ?? [];
  const here = siblings.findIndex((s) => String(s._id) === String(lesson._id));
  const prev = here > 0 ? siblings[here - 1] : null;
  const next = here >= 0 && here < siblings.length - 1 ? siblings[here + 1] : null;

  const stepLink = 'flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-line bg-panel px-5 py-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-glow';
  const stepLabel = 'font-mono text-xs uppercase tracking-[0.12em] text-mute';

  const steps = (prev || next) && (
    <nav aria-label="Continue learning" className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row print:hidden">
      {prev ? (
        <Link to={`/lessons/${prev._id}`} className={stepLink}>
          <span className={stepLabel}>← previous</span>
          <span className="truncate text-base text-ink">{prev.title}</span>
        </Link>
      ) : (
        <span className="hidden flex-1 sm:block" />
      )}

      {next ? (
        <Link to={`/lessons/${next._id}`} className={`${stepLink} sm:text-right`}>
          <span className={stepLabel}>next →</span>
          <span className="truncate text-base text-ink">{next.title}</span>
        </Link>
      ) : (
        <Link to={`/courses/${course?._id}`} className={`${stepLink} sm:text-right`}>
          <span className={stepLabel}>course outline</span>
          <span className="truncate text-base text-ink">Back to {course?.title}</span>
        </Link>
      )}
    </nav>
  );

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
            <p className="m-0 text-base font-semibold text-ink">{statusError ? 'Could not check the generation status' : watching ? 'Waiting for this lesson to finish…' : 'Writing this lesson…'}</p>

            <p className="m-0 mt-[3px] text-sm leading-[1.55] text-dim">
              {statusError
                ? 'Automatic checking paused. Check the status again before starting another generation.'
                : watching
                  ? 'Another request has already started this lesson. We’re checking for the saved result automatically. You can browse other lessons while you wait.'
                  : 'The text, code and questions are being written and saved for future visits.'}
            </p>

            {watching && <button type="button" onClick={checkStatus} className="mt-3 border border-line-strong px-3 py-1.5 text-xs text-glow hover:border-glow">Check status now</button>}

            <div className="mt-[11px] h-[2px] w-full overflow-hidden bg-line">
              <div className="h-full w-1/4 animate-slide bg-accent" />
            </div>
          </div>

          {!statusError && <LessonSkeleton />}
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
          title={['retryable', 'failed'].includes(data.generation?.state) ? 'The previous generation did not finish' : 'This lesson has not been written yet'}
          detail={['retryable', 'failed'].includes(data.generation?.state) ? 'You can start a new attempt now. A new attempt may use your daily lesson allowance.' : 'Generate this lesson when you’re ready. The result will be saved for future visits.'}
          action={
            <>
              {writeError && (
                <p role="alert" className="mb-3 text-sm text-danger">
                  {writeError.code === 'generation_in_progress' ? 'The earlier generation is no longer active. You can check the status or start a new attempt.' : writeError.message}
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
                {pendingId ? 'Another lesson is being written…' : data.generation?.state === 'retryable' ? 'Retry lesson generation →' : 'Write this lesson →'}
              </button>
              <button type="button" onClick={checkStatus} className="ml-3 px-3 py-1.5 text-sm text-dim hover:text-glow">Check status</button>
            </>
          }
        />
      </>
    );
  }

  // Key the entire interactive reader. A sibling at the same block index must
  // not inherit quiz answers or copy feedback from the previous lesson.
  return <LearningContext.Provider value={learning}><LessonReader key={`${lessonId}:${user?.sub ?? 'guest'}`} lesson={lesson} course={course} module={module}
    position={position} total={total} ttsEnabled={features.tts} footer={steps} /></LearningContext.Provider>;
}
