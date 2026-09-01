/**
 * One big number with a small label above it. Three of these make the row on
 * the library page: Courses / Lessons / Written.
 *
 * From the design:
 *   label  font-mono, 8.5px, uppercase, letter-spacing .13em, muted
 *   value  22px, weight 700, letter-spacing -.03em, tabular-nums
 *   "of"   12px, weight 500, muted — renders as  12 / 51
 *   cell   white background, 13px 14px padding
 *
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.value
 * @param {number} [props.of]
 */
export default function StatCell({ label, value, of }) {
  // 1. Label, then value, in that order.
  //
  // 2. `tabular-nums` on the value. Digits have different widths by default, so
  //    three cells side by side sit at slightly different heights-of-eye and the
  //    row looks subtly crooked. One class fixes it.
  //
  // 3. `of` renders after the value as "/ 51" in the smaller muted style.
  //    Test `of !== undefined`, NOT truthiness — a course with 0 lessons is
  //    real, and `of: 0` would silently lose its "/ 0".

  return (
    <div className="bg-panel px-[14px] py-[13px]">
      <div className="mb-[5px] font-mono text-xs uppercase tracking-[0.13em] text-mute">
        {label}
      </div>

      <div className="text-3xl font-bold tracking-[-0.03em] tabular-nums text-ink">
        {value}
        {of !== undefined && (
          <small className="text-sm font-medium tracking-normal text-mute">
            {' / '}
            {of}
          </small>
        )}
      </div>
    </div>
  );
}
