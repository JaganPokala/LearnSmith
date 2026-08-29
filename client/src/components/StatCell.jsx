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
    <div className="bg-white px-[14px] py-[13px]">
      <div className="mb-[5px] font-mono text-[8.5px] uppercase tracking-[0.13em] text-[#8b95a1]">
        {label}
      </div>

      <div className="text-[22px] font-bold tracking-[-0.03em] tabular-nums text-ink">
        {value}
        {of !== undefined && (
          <small className="text-[12px] font-medium tracking-normal text-[#8b95a1]">
            {' / '}
            {of}
          </small>
        )}
      </div>
    </div>
  );
}
