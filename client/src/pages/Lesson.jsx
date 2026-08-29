import { useEffect } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { useLesson } from '../hooks/useLesson.js';
import { useGenerateLesson } from '../hooks/useGenerateLesson.js';
import { SidebarSection, SidebarItem } from '../components/Sidebar.jsx';
import StateMessage from '../components/StateMessage.jsx';
import LessonRenderer from '../components/blocks/LessonRenderer.jsx';

/**
 * GET /api/lessons/:id, plus the POST that writes it.
 *
 * Five states, in the order they must be checked:
 *
 *   loading      → useLesson is still fetching
 *   error        → useLesson failed
 *   not-written  → lesson.isEnriched === false   → the write prompt
 *   generating   → the ACTION hook's `pending`   → the twelve-second message
 *   written      → lesson.isEnriched === true    → objectives + blocks
 *
 * The order is not cosmetic: `loading` and `error` must both be handled before
 * anything reads `data.lesson`, or an errored page crashes on a property of
 * null instead of showing the message you wrote for it.
 */
export default function LessonPage() {
  // 1. const { lessonId } = useParams()
  //    Must match "/lessons/:lessonId" in main.jsx. A mismatch gives undefined,
  //    which becomes a request to /api/lessons/undefined and a 400 that points
  //    at the id rather than at the typo.

  const { lessonId } = useParams();

  // 2. RENAME the second error. Two bindings called `error` in one component is
  //    a shadowing bug waiting to happen, and these two mean genuinely
  //    different things: one is "the page could not load", the other is "the
  //    page loaded fine and the write failed". They render differently.

  const { data, loading, error, applyGeneratedLesson } = useLesson(lessonId);
  const { run, pending, error: writeError, reset } = useGenerateLesson();

  // 3. The slot AppLayout handed down.

  const { setRail } = useOutletContext();

  // ------------------------------------------------------------------
  // 4. FILL THE RAIL.
  //
  //    a) setRail is called from inside the effect, never from the render body:
  //       setting parent state during a child's render re-renders the parent,
  //       which re-renders the child, which sets state again. Infinite.
  //
  //    b) The deps are DATA, not JSX. `[<SidebarSection .../>]` would be a new
  //       element object every render and the effect would never settle.
  //
  //    c) The cleanup matters. Without setRail(null) on unmount, navigating from
  //       a lesson to the library leaves the previous module's lessons in the
  //       rail, still looking clickable.
  //
  //    The built/empty dot goes BEFORE the title: SidebarItem truncates, and
  //    truncation clips from the END — a marker after the title is the first
  //    thing lost on exactly the long names where you still want it.

  useEffect(() => {
    if (!data) return;

    setRail(
      <SidebarSection label={data.module?.title}>
        {data.siblings?.map((sibling) => (
          <SidebarItem key={sibling._id} to={`/lessons/${sibling._id}`}>
            <span
              className={`mr-[7px] inline-block h-[5px] w-[5px] rounded-full align-middle ${
                sibling.isEnriched ? 'bg-chip-built' : 'bg-white/20'
              }`}
            />
            {sibling.title}
          </SidebarItem>
        ))}
      </SidebarSection>,
    );

    return () => setRail(null);
  }, [data, setRail]);

  // ------------------------------------------------------------------
  // 5. THE WRITE HANDLER.
  //
  //    POST returns the lesson ONLY — no siblings, no module, no course.
  //    applyGeneratedLesson does both halves: swaps data.lesson AND flips this
  //    lesson's entry inside data.siblings. Because it builds a new object
  //    rather than mutating, the rail effect's deps change, the effect re-runs,
  //    and the dot flips — with no refetch and no reload.
  //
  //    isEnriched is NOT set by hand here: the lesson coming back already has
  //    it. Deriving the state from the response means a server that somehow
  //    returned an unenriched lesson shows the write prompt again, rather than
  //    an empty page claiming to be written.

  async function handleWrite() {
    // Clear the previous failure first, or it stays on screen through the retry.
    if (writeError) reset();

    const lesson = await run(lessonId);

    if (!lesson) return;

    applyGeneratedLesson(lesson);
  }

  // ------------------------------------------------------------------
  // 6. THE STATE BRANCHES, in order.

  // 6a.
  if (loading) {
    return <StateMessage kind="loading" title="Loading the lesson…" />;
  }

  // 6b.
  if (error) {
    const TITLES = {
      invalid_id: 'That does not look like a lesson link.',
      lesson_not_found: 'This lesson does not exist, or was deleted.',
    };

    return <StateMessage kind="error" title={TITLES[error.code] ?? error.message} />;
  }

  // 6c. Not reachable today; costs one line and means a future change to the
  //     hook cannot produce a blank screen.
  if (!data) {
    return <StateMessage kind="error" title="This lesson does not exist, or was deleted." />;
  }

  const { lesson, course, module, position, total } = data;

  // ------------------------------------------------------------------
  // 7. THE HEADER — shown in ALL THREE of the remaining states, so it sits
  //    above the branch. It is the reason the twelve-second wait is tolerable:
  //    the user is looking at a real page with a title, not a spinner.

  const header = (
    <>
      {position != null && (
        <p className="mb-[9px] font-mono text-[10px] text-[#8b95a1]">
          lesson {position} of {total}
        </p>
      )}

      <p className="mb-[9px] font-mono text-[10px] text-[#8b95a1]">
        <Link to={`/courses/${course?._id}`} className="hover:text-accent">
          {course?.title}
        </Link>
        {module?.title ? ` / ${module.title}` : ''}
      </p>

      <h1 className="mb-4 text-[23px] font-bold tracking-[-0.022em]">{lesson.title}</h1>
    </>
  );

  // ------------------------------------------------------------------
  // 8a. pending is checked BEFORE isEnriched: the lesson is still
  //     isEnriched:false during the twelve seconds, so testing isEnriched first
  //     would keep the write button on screen for the whole call.
  //
  //     Naming the number matters. "Loading…" for twelve seconds reads as
  //     broken; "about 12 seconds" for twelve seconds reads as working.

  if (pending) {
    return (
      <>
        {header}
        <StateMessage
          kind="loading"
          title="Writing this lesson…"
          detail="This takes about 12 seconds. The text, code and questions are being written now, and saved so the next visit is instant."
        />
      </>
    );
  }

  // 8b. The write prompt. The button is disabled while pending — the in-flight
  //     ref inside the hook is the defence that actually holds; this is the one
  //     the user can see. The error stays above the button, which remains, so a
  //     failed generation can be retried.

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
                <p role="alert" className="mb-3 text-[12px] text-[#a8322b]">
                  {writeError.message}
                </p>
              )}

              <button
                type="button"
                onClick={handleWrite}
                disabled={pending}
                className="border border-[#9fd3e0] bg-[#f2fbfd] px-[13px] py-[6px] text-[11.5px] font-semibold text-[#0b6478] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Write this lesson →
              </button>
            </>
          }
        />
      </>
    );
  }

  // 8c. Written.
  return (
    <>
      {header}

      {/* 9. Nothing at all when the array is empty — an empty labelled box
             looks like a rendering bug. */}
      {lesson.objectives?.length > 0 && (
        <div className="mb-[18px] border border-line border-l-2 border-l-accent bg-white px-[13px] py-[11px]">
          <div className="mb-[6px] font-mono text-[8.5px] uppercase tracking-[0.13em] text-[#0b6478]">
            You will be able to
          </div>

          <ul className="m-0 list-disc pl-4">
            {lesson.objectives.map((objective) => (
              <li key={objective} className="mb-[3px] text-[12px] leading-[1.5] text-[#4a535f]">
                {objective}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 10. One dispatcher, five leaf components (Task 5.9). An unrecognised
              block type renders a visible box rather than disappearing. */}
      <div className="max-w-[660px]">
        <LessonRenderer blocks={lesson.content} />
      </div>

    </>
  );
}
