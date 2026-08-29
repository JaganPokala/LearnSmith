import { Link, NavLink } from 'react-router-dom';

/**
 * The dark rail. A FRAME, not a fixed list — each page passes its own sections
 * as children, because the library shows courses and the lesson page shows
 * sibling lessons.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children  the sections for this page
 * @param {React.ReactNode} [props.footer]  the small grey block pinned to the bottom
 */
export default function Sidebar({ children, footer }) {
  // 1. A fixed-width column: w-47 (188px in the design) with `shrink-0` so it
  //    never gets squeezed. bg-ink, and flex-col so the footer can be pushed
  //    down with mt-auto.
  //
  // 2. The logo at the top — font-mono, text-glow, small. Wrap it in a <Link
  //    to="/"> so it goes home, as every app logo does.
  //
  // 3. {children} — whatever sections this page supplied.
  //
  // 4. {footer} at the bottom, pushed there with mt-auto and separated by a
  //    top border. Only render the wrapper if `footer` was passed, or an empty
  //    bordered strip appears on pages that have none.

  return (
    <aside className="flex w-47 shrink-0 flex-col bg-ink px-4 py-5">
      <Link to="/" className="mb-7 block font-mono text-sm tracking-tight text-glow">
        text-to-learn
      </Link>

      {children}

      {footer && (
        <div className="mt-auto border-t border-white/10 pt-4 font-mono text-[11px] text-white/40">
          {footer}
        </div>
      )}
    </aside>
  );
}

/**
 * One labelled group inside the rail: a small grey heading with items under it.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {React.ReactNode} props.children
 */
export function SidebarSection({ label, children }) {
  // Uppercase mono label, tight letter-spacing, muted colour — then children.

  return (
    <div className="mb-6">
      <h2 className="mb-2 px-3 font-mono text-[10px] uppercase tracking-tight text-white/35">
        {label}
      </h2>

      <div className="flex flex-col">{children}</div>
    </div>
  );
}

/**
 * One clickable line in the rail.
 *
 * Uses NavLink rather than Link: NavLink knows whether its route is the one
 * currently showing, which is what drives the cyan bar on the selected item.
 * Its className accepts a function receiving { isActive }.
 *
 * @param {object} props
 * @param {string} props.to
 * @param {React.ReactNode} props.children
 */
export function SidebarItem({ to, children }) {
  // Active:   bg slightly lighter than the rail, text-glow, cyan left border.
  // Inactive: muted text, transparent left border.
  //
  // Keep the left border on BOTH states, transparent when inactive — otherwise
  // the item shifts sideways by 2px when it becomes active.
  //
  // Long course names must truncate, not wrap: truncate + whitespace-nowrap.

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'block truncate whitespace-nowrap border-l-2 px-3 py-1.5 text-[13px]',
          isActive
            ? 'border-glow bg-white/5 text-glow'
            : 'border-transparent text-white/55 hover:bg-white/[0.03] hover:text-white/80',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  );
}
