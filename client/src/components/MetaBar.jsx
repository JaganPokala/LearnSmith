import { Fragment } from 'react';

/**
 * The line of small facts under a page title.
 *
 * From the design: an optional teal pill, then plain mono stats separated by
 * "·", a bottom border, and room on the right for an action.
 *
 *   [3 modules]  13 lessons · 7 written · created 2d ago        [Delete course]
 *
 * @param {object} props
 * @param {string} [props.pill]              the highlighted first item
 * @param {string[]} props.stats             the plain items, joined with ·
 * @param {React.ReactNode} [props.action]   pushed to the right
 */
export default function MetaBar({ pill, stats = [], action }) {
  // 1. A flex row, items centred, wrapping, with a bottom border.
  //
  // 2. The pill first when present: font-mono ~9px, uppercase, wide tracking,
  //    pale teal background, dark teal text.
  //
  // 3. Then each stat in font-mono ~10.5px muted, with a "·" BETWEEN them but
  //    not after the last one.
  //
  //    Render the separator as its own element rather than joining with a
  //    string — a joined string means the dots inherit nothing and cannot be
  //    dimmed separately, and an empty stat would leave a stray dot.
  //
  // 4. `action` pushed right. Use a flex spacer or ml-auto — and only render it
  //    when it exists, so pages without an action get no stray gap.

  // Dropped before rendering, so a caller passing a conditional stat
  // (`written > 0 && \`${written} written\``) never produces a dangling dot.
  const visible = stats.filter(Boolean);

  return (
    <div className="mb-[15px] flex flex-wrap items-center gap-[9px] border-b border-line pb-[11px]">
      {pill && (
        <span className="bg-[#dff4f8] px-[7px] py-[3px] font-mono text-[9px] uppercase tracking-[0.1em] text-[#0b6478]">
          {pill}
        </span>
      )}

      {visible.map((stat, i) => (
        <Fragment key={`${i}-${stat}`}>
          {i > 0 && <span className="font-mono text-[10.5px] text-[#6b7581]">·</span>}
          <span className="font-mono text-[10.5px] text-[#6b7581]">{stat}</span>
        </Fragment>
      ))}

      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
