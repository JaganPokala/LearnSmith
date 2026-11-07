import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { buildLessonReader } from "../lib/lessonReader.js";
import LessonContents from "./LessonContents.jsx";
import LessonRenderer from "./blocks/LessonRenderer.jsx";
import AudioPlayer from "./AudioPlayer.jsx";
import LearningControls from "./LearningControls.jsx";
import QuizHistory from "./QuizHistory.jsx";
import { useLearning } from "../lib/learningContext.js";

export default function LessonReader({
  lesson,
  course,
  module,
  position,
  total,
  ttsEnabled,
  footer,
  shortcuts,
}) {
  const learning = useLearning();
  const model = useMemo(() => buildLessonReader(lesson), [lesson]);
  const firstQuiz = model.outline.find((item) => item.kind === "quiz");

  useEffect(() => {
    // The reader is keyed by lesson ID: sibling navigation starts fresh, while
    // an incoming section link restores its anchor after the content mounts.
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) target.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return (
    <div className="lesson-reader-shell print-full reader-surface">
      <div className="print:hidden">{shortcuts}</div>
      <header
        id="lesson-top"
        tabIndex={-1}
        className="lesson-reader-header scroll-mt-6 border-b border-line pb-7"
      >
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-mute print:hidden"
        >
          <Link
            to={`/courses/${course?._id}`}
            className="text-dim hover:text-glow"
          >
            {course?.title ?? "Course"}
          </Link>
          {module?.title && (
            <>
              <span aria-hidden="true">/</span>
              <span>{module.title}</span>
            </>
          )}
        </nav>
        <span className="reader-status print:hidden">
          {learning?.data
            ? learning.data.progress.completed
              ? "✓ Marked complete"
              : "Ready to read"
            : "Ready to read"}
        </span>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-glow">
          {position != null
            ? `Lesson ${String(position).padStart(2, "0")} of ${total}`
            : "Lesson"}
        </p>
        <h1 className="max-w-[24ch] text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-[1.15] tracking-[-0.035em] text-ink">
          {lesson.title}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-dim print:hidden">
          <span title="Estimated from lesson prose; excludes videos, code exercises, and quizzes">
            ~{model.readingMinutes} min read
          </span>
          {firstQuiz && (
            <a href={`#${firstQuiz.id}`} className="hover:text-glow">
              {model.questions} quick{" "}
              {model.questions === 1 ? "check" : "checks"} ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-xs text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-glow"
            title="Open the print dialog and choose Save as PDF"
          >
            ↓ Save as PDF
          </button>
        </div>
      </header>

      <div className="lesson-reader-grid mt-7">
        <LessonContents outline={model.outline} />
        <article
          aria-label={lesson.title}
          className="lesson-reader-article min-w-0 print-full"
        >
          {lesson.objectives?.length > 0 && (
            <section
              aria-labelledby="lesson-goals"
              className="mb-8 rounded-xl border border-accent-line bg-accent-bg/50 p-5 sm:p-6"
            >
              <h2
                id="lesson-goals"
                className="mb-4 text-sm font-semibold text-glow"
              >
                What you’ll learn
              </h2>
              <ul className="space-y-3">
                {lesson.objectives.map((objective, index) => (
                  <li
                    key={index}
                    className="flex gap-3 text-[15px] leading-relaxed text-body"
                  >
                    <span aria-hidden="true" className="text-glow">
                      ✓
                    </span>
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ttsEnabled && (
            <details className="mb-8 rounded-xl border border-line bg-panel p-4 print:hidden">
              <summary className="cursor-pointer text-sm font-medium text-dim">
                Listen to this lesson{" "}
                <span className="ml-2 text-xs text-mute">
                  Hinglish · AI voice
                </span>
              </summary>
              <div className="mt-4">
                <AudioPlayer lessonId={String(lesson._id)} />
              </div>
            </details>
          )}

          <LessonRenderer
            blocks={model.blocks}
            sourceOffset={model.sourceOffset}
          />
          <LearningControls />
          <QuizHistory />
          {footer}
        </article>
      </div>
    </div>
  );
}
