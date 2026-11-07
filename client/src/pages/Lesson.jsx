import { useEffect } from "react";
import { useParams, useOutletContext, Link } from "react-router-dom";
import { useLesson } from "../hooks/useLesson.js";
import { useGenerateLesson } from "../hooks/useGenerateLesson.js";
import { useCourse } from "../hooks/useCourse.js";
import { useCourseProgress } from "../hooks/useCourseProgress.js";
import CourseNavigator from "../features/courses/CourseNavigator.jsx";
import LessonNavigation from "../features/lessons/LessonNavigation.jsx";
import { lessonNeighbours } from "../features/lessons/lessonNavigation.js";
import { useUsage } from "../lib/usageContext.js";
import StateMessage from "../components/StateMessage.jsx";
import LessonReader from "../components/LessonReader.jsx";
import LessonSkeleton from "../components/LessonSkeleton.jsx";
import { describeError } from "../lib/errors.js";
import RetryButton from "../components/RetryButton.jsx";
import { useAuth } from "../lib/auth.js";
import { useFeatures } from "../hooks/useFeatures.js";
import { useLessonLearning } from "../hooks/useLessonLearning.js";
import { LearningContext } from "../lib/learningContext.js";

/**
 * One measure for the whole article. The objectives box, the skeleton and the
 * blocks all take it, so nothing spans the page while the prose beside it stops
 * two thirds of the way across.
 */
const MEASURE = "max-w-[720px]";

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

  const {
    data,
    loading,
    error,
    statusError,
    checkStatus,
    applyGeneratedLesson,
  } = useLesson(lessonId, !authLoading);
  const { run, pendingId, failure, reset } = useGenerateLesson({ checkStatus });
  const learning = useLessonLearning(
    lessonId,
    !authLoading && String(data?.lesson?._id) === lessonId,
    Boolean(data?.lesson?.isEnriched),
    user?.sub ?? "guest",
  );

  const { setRail } = useOutletContext();
  const outlineRequest = useCourse(
    data?.course?._id,
    !authLoading && Boolean(data?.course?._id),
  );
  const fullCourse =
    String(outlineRequest.data?._id) === String(data?.course?._id)
      ? outlineRequest.data
      : null;
  const { data: usage } = useUsage();
  const courseProgress = useCourseProgress(
    data?.course?._id,
    !authLoading && Boolean(data?.course?._id),
    user?.sub ?? "guest",
  );

  // F3: this component does not unmount when you move between siblings, so both
  // of these must be asked about THIS lesson rather than read as bare flags.
  // Otherwise the sibling you navigate to shows a spinner, or a red message,
  // for a write that was never its own.
  const watching =
    data?.generation?.state === "generating" && !data?.lesson?.isEnriched;
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
    // The full course gives direct access to every module. The current module
    // remains usable if the extra outline read is unavailable.
    const navigationCourse = fullCourse
      ? {
          ...fullCourse,
          modules: fullCourse.modules.map((item) => ({
            ...item,
            lessons: item.lessons?.map((entry) =>
              String(entry._id) === lessonId
                ? { ...entry, isEnriched: data.lesson.isEnriched }
                : entry,
            ),
          })),
        }
      : {
          ...data.course,
          modules: [{ ...data.module, lessons: data.siblings }],
        };
    const completed = new Set(courseProgress.data?.completedLessonIds ?? []);
    // Reflect only acknowledged completion, including a just-saved change.
    if (learning.data?.progress) {
      if (learning.data.progress.completed) completed.add(lessonId);
      else completed.delete(lessonId);
    }
    setRail(
      <>
        <CourseNavigator
          course={navigationCourse}
          completedLessonIds={[...completed]}
        />
        {outlineRequest.error && (
          <p className="outline-legend">
            Only the current module is available.{" "}
            <Link to={`/courses/${data.course?._id}`}>
              Open course overview
            </Link>{" "}
            to load the full outline.
          </p>
        )}
      </>,
    );
    return () => setRail(null);
  }, [
    data,
    fullCourse,
    courseProgress.data,
    learning.data?.progress,
    lessonId,
    outlineRequest.error,
    setRail,
  ]);

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
    const { title, detail, retry } = describeError(error, "lesson");

    return (
      <StateMessage
        kind="error"
        title={title}
        detail={detail}
        action={
          retry ||
          ["network_error", "database_unavailable"].includes(error.code) ? (
            <RetryButton onClick={checkStatus} />
          ) : undefined
        }
      />
    );
  }

  // Not reachable today; costs one line and means a future change to the hook
  // cannot produce a blank screen.
  if (!data) {
    return (
      <StateMessage
        kind="error"
        title="This lesson does not exist, or was deleted."
      />
    );
  }

  const { lesson, course, module, position, total } = data;

  const { previous: prev, next } = lessonNeighbours(
    fullCourse,
    data.siblings,
    lesson._id,
  );
  const steps = (
    <LessonNavigation previous={prev} next={next} courseId={course?._id} />
  );
  const shortcuts = (
    <LessonNavigation
      previous={prev}
      next={next}
      courseId={course?._id}
      compact
    />
  );

  // Shown in all three remaining states, so it sits above the branch. It is the
  // reason the twelve-second wait is tolerable: the user is looking at a real
  // page with a title, not a spinner.
  const header = (
    <header className="reader-start">
      {shortcuts}
      <Link className="learning-link" to={`/courses/${course?._id}`}>
        {course?.title}
      </Link>
      <p className="learning-eyebrow mt-6">{module?.title}</p>
      <h1>{lesson.title}</h1>
      <p>
        {writing
          ? "Preparing your lesson. You can explore the course while we work."
          : "Generate this lesson for explanations, examples and practice questions. We’ll save it for your next visit."}
      </p>
      {!lesson.isEnriched && (
        <p className="learning-helper">
          {usage?.quota?.lessons
            ? `${usage.quota.lessons.remaining} lesson generations left today. `
            : ""}
          Generating uses your daily lesson allowance. Reading saved content
          uses none.
        </p>
      )}
    </header>
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
            <p className="m-0 text-base font-semibold text-ink">
              {statusError
                ? "Could not check the generation status"
                : watching
                  ? "Waiting for this lesson to finish…"
                  : "Preparing your lesson…"}
            </p>

            <p className="m-0 mt-[3px] text-sm leading-[1.55] text-dim">
              {statusError
                ? "Automatic checking paused. Check the status again before starting another generation."
                : watching
                  ? "Another request has already started this lesson. We’re checking for the saved result automatically. You can browse other lessons while you wait."
                  : "The text, code and questions are being written and saved for future visits."}
            </p>

            {watching && (
              <button
                type="button"
                onClick={checkStatus}
                className="mt-3 border border-line-strong px-3 py-1.5 text-xs text-glow hover:border-glow"
              >
                Check status now
              </button>
            )}

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
          title={
            ["retryable", "failed"].includes(data.generation?.state)
              ? "The previous generation did not finish"
              : "Ready to explore this lesson?"
          }
          detail={
            ["retryable", "failed"].includes(data.generation?.state)
              ? "You can start a new attempt now. A new attempt may use your daily lesson allowance."
              : "Generate this lesson when you’re ready. The result will be saved for future visits."
          }
          action={
            <>
              {writeError && (
                <p role="alert" className="mb-3 text-sm text-danger">
                  {writeError.code === "generation_in_progress"
                    ? "The earlier generation is no longer active. You can check the status or start a new attempt."
                    : writeError.message}
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
                {pendingId
                  ? "Another lesson is being written…"
                  : data.generation?.state === "retryable"
                    ? "Retry lesson generation →"
                    : "Generate lesson →"}
              </button>
              <button
                type="button"
                onClick={checkStatus}
                className="ml-3 px-3 py-1.5 text-sm text-dim hover:text-glow"
              >
                Check status
              </button>
            </>
          }
        />
      </>
    );
  }

  // Key the entire interactive reader. A sibling at the same block index must
  // not inherit quiz answers or copy feedback from the previous lesson.
  return (
    <LearningContext.Provider value={learning}>
      <LessonReader
        key={`${lessonId}:${user?.sub ?? "guest"}`}
        lesson={lesson}
        course={course}
        module={module}
        position={position}
        total={total}
        ttsEnabled={features.tts}
        footer={steps}
        shortcuts={shortcuts}
      />
    </LearningContext.Provider>
  );
}
