/**
 * The three "nothing to show" screens: loading, error, empty.
 *
 * One component rather than three — they are the same shape (a heading, a line
 * of explanation, sometimes an action) and every page needs all three.
 *
 * The design's empty-state card (screen 05) is the reference: centred, dashed
 * border, white background, ~26px padding, a 15px semibold heading, a 12.5px
 * muted line under it, then the action.
 *
 * @param {object} props
 * @param {'loading'|'error'|'empty'} props.kind
 * @param {string} props.title
 * @param {string} [props.detail]
 * @param {React.ReactNode} [props.action]
 */
export default function StateMessage({ kind, title, detail, action }) {
  // Same layout for all three; only the border and text colour change:
  //   loading → muted text, solid faint border
  //   error   → red-ish border and heading, so it is distinguishable at a glance
  //   empty   → dashed border (the design's card)
  //
  // Keep it plain. Phase 7 makes these good; today they only have to exist so
  // that no screen can ever render blank.

  const BOX = {
    loading: 'border-solid border-line',
    error: 'border-solid border-[#e5b4b0] bg-[#fdf3f2]',
    empty: 'border-dashed border-[#cdd4dc]',
  };

  const HEADING = {
    loading: 'text-[#5b6470]',
    error: 'text-[#a8322b]',
    empty: 'text-ink',
  };

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`max-w-[520px] border bg-white px-6 py-[26px] text-center ${BOX[kind] ?? BOX.empty}`}
    >
      <p className={`m-0 mb-[6px] text-[15px] font-semibold ${HEADING[kind] ?? HEADING.empty}`}>
        {title}
      </p>

      {detail && (
        <p className="m-0 text-[12.5px] leading-[1.6] text-[#5b6470]">{detail}</p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
