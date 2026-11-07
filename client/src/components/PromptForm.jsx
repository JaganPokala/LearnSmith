import { useState, useEffect, useId } from "react";
import { useNavigate } from "react-router-dom";
import { useGenerateCourse } from "../hooks/useGenerateCourse.js";

export default function PromptForm({ variant = "inline" }) {
  const [topic, setTopic] = useState("");
  const topicId = useId();
  const Field = variant === "creation" ? "textarea" : "input";
  const { run, pending, error, reset } = useGenerateCourse();
  const navigate = useNavigate();

  const [slow, setSlow] = useState(false);

  // Clear the timer when a request ends so it cannot affect the next attempt.
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return undefined;
    }

    const timer = setTimeout(() => setSlow(true), 20_000);

    return () => clearTimeout(timer);
  }, [pending]);

  // Keep explicit submission and the shared hook's duplicate-request guard.
  async function handleSubmit(e) {
    e.preventDefault();

    if (pending || topic.trim() === "") return;

    const course = await run(topic.trim());

    if (course) navigate(`/courses/${course._id}`);
  }

  function handleChange(e) {
    setTopic(e.target.value);

    if (error) reset();
  }

  const SKIN = {
    inline: {
      form: "flex-col gap-2 border-line-strong bg-panel p-2 sm:flex-row sm:items-center sm:gap-3 sm:p-3",
      input:
        "w-full px-2 py-1 text-[15px] text-ink placeholder:text-mute sm:text-base",
      button:
        "w-full bg-accent px-3 py-2 text-[13px] font-semibold text-white sm:w-auto sm:px-4 sm:text-sm",
      track: "bg-line",
      bar: "bg-accent",
      note: "text-dim",
    },
    hero: {
      form: "flex-col gap-2 rounded-xl border-line-strong bg-panel p-2",
      input:
        "w-full rounded-md px-3 py-3 text-base text-ink placeholder:text-mute",
      button:
        "w-full rounded-md bg-accent px-3 py-3 text-sm font-semibold text-white hover:bg-accent/90",
      track: "bg-line",
      bar: "bg-accent",
      note: "text-dim",
    },
  };

  const skin =
    variant === "creation" ? SKIN.hero : (SKIN[variant] ?? SKIN.inline);

  return (
    <div>
      <label
        htmlFor={topicId}
        className="mb-3 block text-sm font-semibold text-ink"
      >
        {variant === "creation"
          ? "Your topic"
          : "What would you like to learn?"}
      </label>
      <form
        onSubmit={handleSubmit}
        className={`flex w-full border ${skin.form}`}
      >
        <Field
          id={topicId}
          {...(variant === "creation" ? { rows: 4 } : { type: "text" })}
          value={topic}
          onChange={handleChange}
          disabled={pending}
          placeholder={
            variant === "creation"
              ? "I’m new to Python and want to learn to work with CSV files."
              : variant === "hero"
                ? "For example, Python for beginners"
                : "Name a topic — “Intro to GraphQL”, “Basics of contract law”…"
          }
          aria-label="Course topic"
          className={`min-w-0 flex-1 bg-transparent ${skin.input}`}
        />

        <button
          type="submit"
          disabled={pending || topic.trim() === ""}
          className={`shrink-0 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${skin.button}`}
        >
          {pending
            ? "Creating your outline…"
            : variant === "hero"
              ? "Create my course →"
              : "Create course outline →"}
        </button>
      </form>
      {(variant === "hero" || variant === "creation") && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Example topics">
          {["Python basics", "React hooks", "Personal budgeting"].map(
            (example) => (
              <button
                key={example}
                type="button"
                disabled={pending}
                onClick={() => {
                  setTopic(example);
                  if (error) reset();
                }}
                className="rounded-full border border-line px-3 py-2 text-xs text-dim hover:border-accent disabled:opacity-50"
              >
                {example}
              </button>
            ),
          )}
        </div>
      )}

      {pending && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className={`h-[2px] w-full overflow-hidden ${skin.track}`}>
            <div className={`h-full w-1/4 animate-slide ${skin.bar}`} />
          </div>

          <p className={`mt-2 font-mono text-[12.5px] ${skin.note}`}>
            {slow
              ? "This is taking longer than usual. Please keep this page open."
              : "Creating your course outline…"}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
