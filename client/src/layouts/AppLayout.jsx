import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AUTH_ENABLED, useAuth } from "../lib/auth.js";
import SignInMenu from "../features/home/SignInMenu.jsx";
import UsagePanel from "../components/UsagePanel.jsx";
import AccountMenu from "../features/auth/AccountMenu.jsx";
import "../styles/learning.css";
import "../styles/workspace.css";

export default function AppLayout() {
  const { pathname } = useLocation();
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [rail, setRail] = useState(null);
  const drawer = useRef(null);
  const outlineTrigger = useRef(null);
  const previousOverflow = useRef("");
  const modalActive = useRef(false);
  const context = useMemo(() => ({ setRail }), []);
  const reading = pathname.startsWith("/lessons/");
  const coursePage =
    /^\/courses\/[^/]+$/.test(pathname) && pathname !== "/courses/new";
  const hasOutline = Boolean(rail && (reading || coursePage));

  useEffect(() => {
    document.title = `${reading ? "Lesson" : coursePage ? "Course overview" : pathname === "/courses/new" ? "Create a course" : pathname === "/billing" ? "Plan & billing" : "My learning"} — LearnSmith`;
    window.scrollTo(0, 0);
    drawer.current?.close();
  }, [pathname, reading, coursePage]);

  function closeDrawer() {
    drawer.current?.close();
    outlineTrigger.current?.focus();
  }
  function openDrawer() {
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalActive.current = true;
    drawer.current?.showModal();
  }
  function restoreDrawerFocus() {
    if (modalActive.current)
      document.body.style.overflow = previousOverflow.current;
    modalActive.current = false;
    outlineTrigger.current?.focus();
  }
  useEffect(
    () => () => {
      if (modalActive.current)
        document.body.style.overflow = previousOverflow.current;
    },
    [],
  );

  return (
    <div className={`workspace ${reading ? "workspace-reading" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="workspace-header">
        <Link className="workspace-brand" to="/">
          LearnSmith<span aria-hidden="true">✳</span>
        </Link>
        <nav
          className="workspace-global-nav"
          aria-label="Application navigation"
        >
          <NavLink to="/courses" end>
            My learning
          </NavLink>
          <NavLink to="/courses/new">Create a course</NavLink>
          <NavLink to="/billing">Plan & billing</NavLink>
          <NavLink to="/help">Help</NavLink>
        </nav>
        <div className="workspace-account">
          {isLoading ? (
            <span role="status">Checking account…</span>
          ) : isAuthenticated ? (
            <AccountMenu user={user} logout={logout} />
          ) : AUTH_ENABLED ? (
            <SignInMenu returnTo={pathname} />
          ) : (
            <span>Guest</span>
          )}
        </div>
      </header>
      <div className="workspace-utility">
        {hasOutline && (
          <button
            ref={outlineTrigger}
            type="button"
            className="workspace-outline-trigger"
            onClick={openDrawer}
          >
            ☰ Course outline
          </button>
        )}
        <UsagePanel compact />
        <Link to="/courses/new" className="workspace-create-shortcut">
          + New course
        </Link>
      </div>
      <div className={`workspace-body ${hasOutline ? "with-outline" : ""}`}>
        {hasOutline && <aside className="workspace-rail">{rail}</aside>}
        <main id="main-content" className="workspace-main print-full">
          <Suspense
            fallback={
              <p role="status" className="py-8 text-dim">
                Loading page…
              </p>
            }
          >
            <Outlet context={context} />
          </Suspense>
        </main>
      </div>
      {/* A native modal handles Escape, focus containment and focus return. Only
        one outline is displayed at a time; section links use an inline disclosure. */}
      <dialog
        ref={drawer}
        className="workspace-drawer"
        aria-labelledby="outline-dialog-title"
        onClick={(event) => {
          if (event.target === drawer.current) closeDrawer();
        }}
        onClose={restoreDrawerFocus}
      >
        <header>
          <h2 id="outline-dialog-title">Course outline</h2>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close course outline"
          >
            ✕
          </button>
        </header>
        <div
          onClick={(event) => {
            if (event.target.closest("a")) drawer.current?.close();
          }}
        >
          {rail}
        </div>
      </dialog>
    </div>
  );
}
