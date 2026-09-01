import { useState, useMemo, useCallback, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';

/** Matches Tailwind's md. Named once so the JS and the classes cannot drift. */
const DESKTOP = '(min-width: 768px)';

/** Drag limits. Below MIN a lesson title is unreadable; above MAX the rail wins. */
const MIN_WIDTH = 220;
const MAX_WIDTH = 560;

/**
 * The rail plus the space beside it. Wraps every page except the landing.
 *
 * Rendered ONCE and kept mounted while the URL changes — only <Outlet /> swaps.
 * A <Sidebar /> inside each page instead would remount on every navigation.
 *
 * THE RAIL SLOT
 * -------------
 * The rail's contents differ per page, but only the page knows what to put
 * there, and a page rendered inside <Outlet /> cannot reach up into its
 * parent's markup. So the layout holds the rail as state and hands the SETTER
 * down. Data still flows downward; only a function crosses the boundary.
 */
export default function AppLayout() {
  const [rail, setRail] = useState(null);

  // Open on a desktop, closed on a phone — where the rail is a drawer OVER the
  // page rather than a column beside it, and starting open would mean every
  // visit begins behind a menu. Lazy initialiser: this runs once, not per render.
  const [open, setOpen] = useState(() => window.matchMedia(DESKTOP).matches);

  // Dragged width in px, or null for the responsive default. Delivered as a CSS
  // VARIABLE rather than an inline `width`, because an inline width would also
  // hit the phone drawer, which sizes itself from the viewport instead.
  const [width, setWidth] = useState(null);

  // The initialiser above runs ONCE, so without this the rail keeps whatever
  // state it had when the page loaded: shrink a desktop window and the drawer
  // stays open, covering the page it is supposed to sit beside.
  //
  // Subscribing to a media query is what effects are actually for — an external
  // system pushing changes in. The state is set from the EVENT, never from the
  // effect body, so the first render is not followed by a second one.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP);

    const follow = (event) => setOpen(event.matches);

    query.addEventListener('change', follow);

    return () => query.removeEventListener('change', follow);
  }, []);

  // Memoised with an EMPTY dependency array, and this is load-bearing.
  // `setRail` is stable forever, but `{ setRail }` written inline in the JSX
  // would be a new object every render — so a page effect listing the context
  // in its deps would re-run, call setRail, re-render this layout, build
  // another object, and run again. An infinite loop from an object literal.
  const outletContext = useMemo(() => ({ setRail }), []);

  // On a phone the drawer covers the page, so following a link inside it has to
  // close it — otherwise you tap a lesson and go on looking at the menu.
  //
  // Delegated from the wrapper rather than threaded through every SidebarItem:
  // the rail's contents are built by the PAGES, so there is no single place to
  // attach a handler otherwise. Reacting to the click also beats reacting to a
  // route change, which would set state during an effect on every navigation.
  function closeIfLinkOnPhone(event) {
    if (event.target.closest('a') && !window.matchMedia(DESKTOP).matches) setOpen(false);
  }

  // Listeners go on WINDOW, not on the handle. The pointer routinely leaves a
  // 5px strip mid-drag — faster than the re-render — and a handler bound to the
  // handle would stop receiving moves the moment it did, freezing the rail
  // until you clicked again.
  const startResize = useCallback((event) => {
    event.preventDefault();

    const move = (e) => setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      // Restored here rather than in a cleanup: without it the whole document
      // stays unselectable for the rest of the session.
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    // Dragging across text selects it, which looks broken and leaves the page
    // highlighted when you let go.
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Phone only. Catches the tap outside the drawer, which is how everyone
          expects to dismiss one. */}
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden print:hidden"
        />
      )}

      {/* One element, two layouts: an overlay on a phone, a real column from md
          up. The default is a quarter of the viewport, clamped — 1/4 of 2560px
          is a 640px rail nobody wants, and 1/4 of 800px is too narrow to read a
          lesson title.

          The cap is `min(560px, 33vw)` and NOT two max-width classes. A dragged
          width is an absolute px value, so a rail dragged to 380px keeps that
          width as the window shrinks and ends up owning half an 800px screen —
          the viewport term is what stops it. Written as one value because
          `md:max-w-[560px] md:max-w-[33vw]` would be two utilities of equal
          specificity, decided by stylesheet order rather than by intent. */}
      <div
        onClick={closeIfLinkOnPhone}
        style={{ '--rail': width === null ? '25%' : `${width}px` }}
        className={`${open ? 'block' : 'hidden'} print:!hidden fixed inset-y-0 left-0 z-40 w-[82%] max-w-[330px] md:relative md:w-[var(--rail)] md:min-w-[220px] md:max-w-[min(560px,33vw)]`}
      >
        <Sidebar onClose={() => setOpen(false)}>{rail}</Sidebar>

        {/* The drag handle. Sits ON the seam, half its width over each side, so
            the target is bigger than the 1px line it appears to be. Desktop
            only: a phone has no pointer to hover it with, and the drawer is
            sized by the viewport there anyway. */}
        <div
          onPointerDown={startResize}
          onDoubleClick={() => setWidth(null)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the sidebar (double-click to reset)"
          title="Drag to resize · double-click to reset"
          className="absolute inset-y-0 -right-[3px] hidden w-[6px] cursor-col-resize bg-transparent hover:bg-accent/40 active:bg-accent/60 md:block"
        />
      </div>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 md:px-8 md:py-7">
        {/* In the flow rather than floating over the page: a fixed button in the
            corner sits on top of the first line of every title. Sticky so it is
            still reachable partway down a long lesson. */}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Show the sidebar"
            className="sticky top-3 z-20 mb-4 border border-line bg-panel px-[9px] py-[5px] font-mono text-xs text-dim hover:border-accent hover:text-accent print:hidden"
          >
            ›› menu
          </button>
        )}

        {/* Capped either way, so a row's title and its date are never 1300px
            apart on a wide monitor. The ALIGNMENT depends on the rail:

            open   → left, so the gap between the rail and the text is the
                     <main> padding and nothing else. Centring here instead
                     makes that gap a function of the window width and the
                     dragged rail width, so it is different on every screen
                     and changes as you drag.
            closed → centred, because there is nothing to sit beside. */}
        <div className={`print-full max-w-[1100px] ${open ? '' : 'mx-auto'}`}>
          <Outlet context={outletContext} />
        </div>
      </main>
    </div>
  );
}
