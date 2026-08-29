import { useState, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';

/**
 * The dark rail plus the space beside it. Wraps every page except the landing.
 *
 * Rendered ONCE and kept mounted while the URL changes — only <Outlet /> swaps.
 * Putting <Sidebar /> inside each page instead would remount it on every
 * navigation: a visible flash, and any state it held is lost.
 *
 * THE RAIL SLOT (Task 5.8)
 * ------------------------
 * The rail's contents differ per page — the library lists courses, the lesson
 * page lists sibling lessons — but only the page knows what to put there, and a
 * page rendered inside <Outlet /> cannot reach up into its parent's markup.
 *
 * So the layout holds the rail as state and hands the SETTER down. Data still
 * flows downward; only a function crosses the boundary. Pages call it from an
 * effect (see pages/Lesson.jsx).
 */
export default function AppLayout() {
  // Whatever the current page asked the rail to show. null on pages that ask
  // for nothing, which renders an empty rail rather than a stale one.
  const [rail, setRail] = useState(null);

  // The context object is memoised with an EMPTY dependency array, and this is
  // load-bearing.
  //
  // `setRail` from useState is already stable forever. But `{ setRail }` written
  // inline in the JSX below would be a brand-new object on every render — so a
  // page effect that lists the context in its deps would re-run, call setRail,
  // re-render this layout, build another new object, and run again. An infinite
  // loop that locks the tab, caused by an object literal.
  const outletContext = useMemo(() => ({ setRail }), []);

  return (
    <div className="flex min-h-screen">
      <Sidebar>{rail}</Sidebar>

      <main className="min-w-0 flex-1 px-[26px] py-[22px]">
        {/* Cap the reading width. Without this, on a wide monitor a row's title
            and its date sit ~1300px apart and the eye cannot track between them.
            Left-aligned rather than centred: the rail is already a strong left
            anchor, and centring would open a gap beside it. */}
        <div className="max-w-[1100px]">
          <Outlet context={outletContext} />
        </div>
      </main>
    </div>
  );
}
