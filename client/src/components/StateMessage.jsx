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
 * @param {boolean} [props.progress]  show the indeterminate bar
 * @param {React.ReactNode} [props.action]
 */
export default function StateMessage({ kind, title, detail, progress, action }) {
  // Same layout for all three; only the border and text colour change:
  //   loading → muted text, solid faint border
  //   error   → red-ish border and heading, so it is distinguishable at a glance
  //   empty   → dashed border (the design's card)
  //
  // Keep it plain. Phase 7 makes these good; today they only have to exist so
  // that no screen can ever render blank.

  // The BACKGROUND is part of each entry, not a shared class alongside them.
  // `bg-panel` in the base string plus `bg-danger-bg` here would put two
  // background utilities of equal specificity in one class list, and which one
  // wins is decided by their order in the STYLESHEET, not in the attribute —
  // the same silent conflict DeleteButton already hit with opacity.
  const BOX = {
    loading: 'border-solid border-line bg-panel',
    error: 'border-solid border-danger-line bg-danger-bg',
    empty: 'border-dashed border-line-strong bg-panel',
  };

  const HEADING = {
    loading: 'text-dim',
    error: 'text-danger',
    empty: 'text-ink',
  };

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`max-w-[560px] border px-6 py-[26px] text-center ${BOX[kind] ?? BOX.empty}`}
    >
      <p className={`m-0 mb-[6px] text-lg font-semibold ${HEADING[kind] ?? HEADING.empty}`}>
        {title}
      </p>

      {detail && (
        <p className="m-0 text-base leading-[1.6] text-dim">{detail}</p>
      )}

      {/* Same indicator as the prompt form, so both long waits in the app look
          like the same kind of event. Indeterminate: the server reports no
          stage, and generation latency genuinely varies. */}
      {progress && (
        <div className="mx-auto mt-4 h-[2px] w-full max-w-[260px] overflow-hidden bg-line">
          <div className="h-full w-1/4 animate-slide bg-accent" />
        </div>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
