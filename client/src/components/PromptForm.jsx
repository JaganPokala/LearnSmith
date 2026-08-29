import { useState } from 'react';
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

  const SKIN = {
    inline: {
      form: 'border-[#cdd4dc] bg-white gap-[11px] px-[13px] py-[11px]',
      input: 'text-[13px] text-ink placeholder:text-[#9aa4b0]',
      button: 'bg-accent px-[13px] py-[6px] text-[11.5px] font-semibold text-white',
    },
    hero: {
      form: 'border-[#263039] bg-[#0e1318]',
      input: 'px-[15px] py-[13px] font-mono text-[13.5px] text-[#e2e8ef] placeholder:text-[#4d5966]',
      button: 'bg-glow px-5 py-[13px] text-[12.5px] font-bold text-[#06181d]',
    },
  };

  const skin = SKIN[variant] ?? SKIN.inline;

  return (
    <div>
      <form onSubmit={handleSubmit} className={`flex w-full items-center border ${skin.form}`}>
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

      {/* 5. Render `error.message` under the form when there is one. It is
             already the server's own wording — readable, and specific to what
             went wrong. */}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[#a8322b]">
          {error.message}
        </p>
      )}
    </div>
  );
}
