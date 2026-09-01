/** Bar widths, in order down the page. Varied so it reads as prose, not a grid. */
const LINES = [
  ['94%', '99%', '88%', '72%'],
  ['97%', '91%', '84%'],
];

/**
 * The shape of a lesson, greyed out, shown while one is being written.
 *
 * A skeleton rather than a small centred card: the wait is eight to thirteen
 * seconds, and a block the size and shape of the page you are about to get
 * reads as progress, where a 520px box alone in an empty viewport reads as a
 * stall. Purely decorative — the live region announcing the wait is the banner
 * above it, so this is hidden from screen readers.
 */
export default function LessonSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="mb-[18px] border border-line border-l-2 border-l-line-strong bg-panel px-[13px] py-[11px]">
        <div className="mb-[10px] h-[9px] w-[128px] bg-raised" />
        <div className="mb-[7px] h-[9px] w-[86%] bg-line" />
        <div className="mb-[7px] h-[9px] w-[79%] bg-line" />
        <div className="h-[9px] w-[68%] bg-line" />
      </div>

      {LINES.map((paragraph, i) => (
        <div key={i}>
          <div className="mb-[14px] mt-[26px] h-[14px] w-[46%] bg-raised first:mt-0" />

          {paragraph.map((w, j) => (
            <div key={j} className="mb-[9px] h-[11px] bg-line" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  );
}
