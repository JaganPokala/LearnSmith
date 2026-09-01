import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGenerateCourse } from '../hooks/useGenerateCourse.js';

/**
 * The topic input. Used twice with different skins:
 *
 *   inline  library page — white, thin border, small teal button
 *   hero    landing page — dark, larger, cyan button
 *
 * Same behaviour in both. Building it once means the double-submit guard is
 * written once.
 *
 * @param {object} props
 * @param {'inline'|'hero'} [props.variant]
 */
export default function PromptForm({ variant = 'inline' }) {
  // 1. const [topic, setTopic] = useState('')
  //    const { run, pending, error, reset } = useGenerateCourse()
  //    const navigate = useNavigate()

  const [topic, setTopic] = useState('');
  const { run, pending, error, reset } = useGenerateCourse();
  const navigate = useNavigate();

  // A generation past this point is not a normal one. Measured runs land at
  // ~7s; anything beyond twenty is almost always Render's free instance waking
  // up, and "usually about seven seconds" stops being reassuring and starts
  // reading as broken.
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return undefined;
    }

    const timer = setTimeout(() => setSlow(true), 20_000);

    // Without this, a fast generation leaves the timer running and it flips
    // `slow` on during the NEXT one, twenty seconds too early.
    return () => clearTimeout(timer);
  }, [pending]);

  // 2. handleSubmit(e):
  //      e.preventDefault()   ← FIRST LINE, ALWAYS.
  //
  //      Without it the browser does a real form submission: a full page
  //      reload with the value in the query string. The whole React app tears
  //      down and reboots. It looks like a crash and it is one character.
  //
  //      Then: bail if pending or the topic is blank.
  //      const course = await run(topic.trim())
  //      if (course) navigate(`/courses/${course._id}`)

  async function handleSubmit(e) {
    e.preventDefault();

    if (pending || topic.trim() === '') return;

    const course = await run(topic.trim());

    if (course) navigate(`/courses/${course._id}`);
  }

  // 3. handleChange(e):
  //      setTopic(e.target.value)
  //      and clear the error if one is showing — otherwise the user is reading
  //      a complaint about text they have already replaced.

  function handleChange(e) {
    setTopic(e.target.value);

    if (error) reset();
  }

  // 4. THE MARKUP MUST BE A REAL <form onSubmit={handleSubmit}>.
  //
  //    Not a div with onClick on the button. With onClick alone, pressing
  //    Enter in a single-field form does nothing at all — and every user
  //    expects Enter to submit. A form gives you Enter and the click through
  //    the same path.
  //
  //    The <input> is CONTROLLED: value={topic} AND onChange={handleChange}.
  //    Supply value without onChange and the field is read-only — you type and
  //    nothing appears, because React keeps overwriting it with unchanged state.
  //
  //    The <button type="submit"> is disabled when pending OR the trimmed topic
  //    is empty. Give it a different label while pending — "Generating…" — or
  //    six seconds of an unchanged button reads as a dead click.
  //
  //    Do NOT validate length or emptiness beyond that. The server rejects
  //    empty, whitespace-only and >200 chars with its own codes and messages;
  //    duplicating those rules here creates two copies that drift (see F1).
  //
  // 6. Two skins, one behaviour. Keep the shared classes in one string and
  //    switch only the colours and sizes on `variant`, the same way
  //    SidebarItem handles active/inactive.

  // STACKS below 640px — the button drops under the input — and everything
  // shrinks with it: smaller padding and smaller type, so the stacked form is a
  // compact block rather than two tall full-width bars.
  //
  // The input keeps `flex-1 min-w-0` and the button `shrink-0` from the shared
  // classes, which is what makes the side-by-side row above 640px absorb width
  // into the input rather than pushing the button off the edge.
  const SKIN = {
    inline: {
      form: 'flex-col gap-2 border-line-strong bg-panel p-2 sm:flex-row sm:items-center sm:gap-3 sm:p-3',
      input: 'w-full px-2 py-1 text-[15px] text-ink placeholder:text-mute sm:text-base',
      button:
        'w-full bg-accent px-3 py-2 text-[13px] font-semibold text-white sm:w-auto sm:px-4 sm:text-sm',
      track: 'bg-line',
      bar: 'bg-accent',
      note: 'text-dim',
    },
    hero: {
      form: 'flex-col border-[#263039] bg-[#0e1318] sm:flex-row sm:items-center',
      input:
        'w-full px-3 py-3 font-mono text-[15px] text-[#e2e8ef] placeholder:text-[#4d5966] sm:px-4 sm:py-4 sm:text-lg',
      button:
        'w-full bg-glow px-3 py-3 text-[14px] font-bold text-[#06181d] sm:w-auto sm:px-6 sm:py-4 sm:text-lg',
      track: 'bg-[#1a2028]',
      bar: 'bg-glow',
      note: 'text-[#93a0ad]',
    },
  };

  const skin = SKIN[variant] ?? SKIN.inline;

  return (
    <div>
      <form onSubmit={handleSubmit} className={`flex w-full border ${skin.form}`}>
        <input
          type="text"
          value={topic}
          onChange={handleChange}
          disabled={pending}
          placeholder={
            variant === 'hero'
              ? 'Intro to React Hooks'
              : 'Name a topic — “Intro to GraphQL”, “Basics of contract law”…'
          }
          aria-label="Course topic"
          className={`min-w-0 flex-1 bg-transparent outline-none ${skin.input}`}
        />

        <button
          type="submit"
          disabled={pending || topic.trim() === ''}
          className={`shrink-0 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${skin.button}`}
        >
          {pending ? 'Generating…' : 'Generate →'}
        </button>
      </form>

      {/* The wait. Seven seconds of a disabled button reads as a dead click,
          and this is the first thing a visitor does.

          Indeterminate on purpose: the track is a fixed strip and the segment
          crosses it on a loop. A percentage would have to be invented — the
          server reports no stage, and generation latency genuinely varies. */}
      {pending && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className={`h-[2px] w-full overflow-hidden ${skin.track}`}>
            <div className={`h-full w-1/4 animate-slide ${skin.bar}`} />
          </div>

          <p className={`mt-2 font-mono text-[12.5px] ${skin.note}`}>
            {slow
              ? 'still working — the server may be waking up, this can take a minute'
              : 'generating your course…'}
          </p>
        </div>
      )}

      {/* 5. Render `error.message` under the form when there is one. It is
             already the server's own wording — readable, and specific to what
             went wrong. */}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
