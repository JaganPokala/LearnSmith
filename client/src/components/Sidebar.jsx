import { Link, NavLink } from 'react-router-dom';
import AccountBlock from './AccountBlock.jsx';

/**
 * The dark rail. A FRAME, not a fixed list — each page passes its own sections
 * as children, because the library shows courses and a lesson shows its module.
 *
 * Sized by its wrapper in AppLayout, not here, so one place owns the width.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children  the sections for this page
 * @param {() => void} [props.onClose]
 */
export default function Sidebar({ children, onClose }) {
  return (
    // h-full + overflow-y-auto, or a course with sixty lessons pushes the
    // footer off the bottom of a fixed-height drawer with no way to reach it.
    <aside className="flex h-full w-full flex-col overflow-y-auto bg-panel px-4 py-5">
      <div className="mb-6 flex items-center gap-2">
        <Link to="/" className="font-mono text-base font-bold tracking-tight text-glow">
          text-to-learn
        </Link>

        <button
          type="button"
          onClick={onClose}
          aria-label="Hide the sidebar"
          className="ml-auto shrink-0 border border-line-strong px-2 py-1 font-mono text-xs text-mute hover:border-glow hover:text-glow"
        >
          ‹‹
        </button>
      </div>

      {children}

      {/* App chrome, not page content, so it is rendered here rather than
          passed through the rail slot — every page wants the same one. */}
      <AccountBlock />
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
  return (
    <div className="mb-6">
      <h2 className="mb-2 px-3 font-mono text-xs uppercase tracking-[0.1em] text-mute">
        {label}
      </h2>

      <div className="flex flex-col">{children}</div>
    </div>
  );
}

/**
 * One clickable line in the rail.
 *
 * NavLink rather than Link: it knows whether its route is the one showing,
 * which is what drives the cyan bar on the selected item.
 *
 * @param {object} props
 * @param {string} props.to
 * @param {boolean} [props.end]  match this path exactly, not as a prefix
 * @param {React.ReactNode} props.children
 */
export function SidebarItem({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          // The left border stays on both states, transparent when inactive, or
          // the item shifts sideways by 2px the moment it becomes active.
          'block truncate whitespace-nowrap border-l-2 px-3 py-[7px] text-base',
          isActive
            ? 'border-glow bg-raised text-glow'
            : 'border-transparent text-dim hover:bg-raised hover:text-ink',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * The small filled/hollow dot that marks whether a lesson has been written.
 *
 * Sits BEFORE the title: SidebarItem truncates, and truncation clips from the
 * end — a marker after the title is the first thing lost on exactly the long
 * names where you still want it.
 *
 * @param {object} props
 * @param {boolean} props.isEnriched
 */
export function SidebarDot({ isEnriched }) {
  return (
    <span
      className={`mr-[7px] inline-block h-[5px] w-[5px] rounded-full align-middle ${
        isEnriched ? 'bg-ok' : 'bg-line-strong'
      }`}
    />
  );
}

/**
 * The small grey block under a page's rail sections — totals, counts.
 *
 * Exported rather than a prop on Sidebar: pages reach the rail through
 * `children` only, so a prop here would be one no caller could ever set. It no
 * longer takes `mt-auto`; AccountBlock owns the bottom of the rail, and two
 * elements both claiming the free space leaves the first floating mid-column.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export function SidebarFooter({ children }) {
  return (
    <div className="mt-3 border-t border-line pt-3 font-mono text-meta text-mute">
      {children}
    </div>
  );
}
