/**
 * { type: 'code', language, text }
 *
 * NOTE: neither lesson written so far contains one of these — conceptual topics
 * produce no code. This component gets verified against a programming lesson
 * generated on purpose, not against what happens to be in the database.
 *
 * @param {object} props
 * @param {object} props.block
 */
export default function CodeBlock({ block }) {
  // 1. A <pre><code> inside a bordered box, raised off the page so it
  //    reads as a different kind of content from the prose around it.
  //
  // 3. The language label, small and mono, above the code. It comes straight
  //    from the model, so treat it as untrusted text:
  //      - it may be missing → render no label rather than an empty chip
  //      - it may be a phrase rather than a language (the NON_LANGUAGES guard
  //        in lessonGenerator.js exists because the model has emitted things
  //        like "pseudocode" and "none"). Lowercase it and cap the length.
  //
  //    Do NOT use it to pick a syntax highlighter today. No highlighting is
  //    Phase 7 polish at worst; a highlighter that throws on an unknown
  //    language string takes the whole page down.

  const language =
    typeof block.language === 'string' ? block.language.trim().toLowerCase().slice(0, 20) : '';

  return (
    <div className="my-[14px] border-l-2 border-l-accent bg-raised px-[14px] py-[12px]">
      {language && (
        <span className="mb-[7px] block font-mono text-xs uppercase tracking-[0.13em] text-mute">
          {language}
        </span>
      )}

      {/* 2. THE ONE THING THAT MUST BE RIGHT: `overflow-x-auto` on the <pre>.
             <main> already has min-w-0, which lets the column shrink. That only
             helps if the block itself takes responsibility for its own
             overflow. Without it, one 200-character line pushes the entire page
             sideways — the rail scrolls off screen and every other lesson looks
             broken too.

             Paired with whitespace-pre so lines do NOT wrap. Wrapped code is
             code with invented line breaks, which for Python is actively
             wrong. */}
      <pre className="m-0 overflow-x-auto whitespace-pre font-mono text-sm leading-[1.65] text-body">
        <code>{block.text}</code>
      </pre>
    </div>
  );
}
