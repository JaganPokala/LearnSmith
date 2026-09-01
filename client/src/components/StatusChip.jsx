/**
 * The small box saying whether a lesson has been written.
 *
 * The only thing on screen that makes lazy generation visible — without it a
 * 12-second wait reads as a bug rather than a feature.
 *
 * @param {object} props
 * @param {boolean} props.isEnriched
 */
export default function StatusChip({ isEnriched }) {
  // Two looks from one boolean:
  //   built → teal border, pale teal background, dark teal text
  //   empty → grey border, no background, muted text
  //
  // Shared classes: font-mono, ~8.5px, uppercase, wide tracking, tight padding,
  // and `whitespace-nowrap` so it never wraps inside a row.
  //
  // Build the class string the same way you did in SidebarItem — one shared
  // string plus a conditional one.

  const className = [
    // Square corners: the Console direction is rounded-none everywhere.
    'inline-block whitespace-nowrap border px-1.5 py-px',
    'font-mono text-xs uppercase tracking-[0.12em]',
    isEnriched
      ? 'border-ok/60 bg-ok/15 text-ok'
      : 'border-line text-mute',
  ].join(' ');

  return <span className={className}>{isEnriched ? 'built' : 'empty'}</span>;
}
