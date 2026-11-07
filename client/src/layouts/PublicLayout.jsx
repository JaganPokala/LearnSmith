import { Suspense, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AUTH_ENABLED, useAuth } from "../lib/auth.js";
import SignInMenu from "../features/home/SignInMenu.jsx";
import "../styles/home.css";
import "../styles/public.css";

export default function PublicLayout() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { pathname, hash } = useLocation();

  useEffect(() => {
    document.title =
      {
        "/": "LearnSmith — Your next learning path",
        "/pricing": "Pricing — LearnSmith",
        "/help": "Help — LearnSmith",
      }[pathname] || "Page not found — LearnSmith";
    // Keep section links working, but start a new public page at its heading.
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
    return () => {
      document.title = "LearnSmith — Your next learning path";
    };
  }, [pathname, hash]);

  return (
    <div className="home">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="home-header home-container">
        <Link className="wordmark" to="/">
          LearnSmith<span aria-hidden="true">✳</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/#how-it-works">How it works</Link>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/help">Help</NavLink>
          <Link to="/courses">My learning</Link>
        <Link to="/courses/new">Create a course</Link>
        </nav>
        {AUTH_ENABLED &&
          (isLoading ? (
            <span role="status">Checking account…</span>
          ) : isAuthenticated ? (
            <button
              className="home-secondary"
              onClick={() =>
                logout({ logoutParams: { returnTo: window.location.origin } })
              }
            >
              Sign out
            </button>
          ) : (
            <SignInMenu />
          ))}
      </header>
      <Suspense
        fallback={
          <main
            id="main-content"
            className="public-page home-container"
            role="status"
          >
            Loading page…
          </main>
        }
      >
        <Outlet />
      </Suspense>
      <footer className="home-footer home-container">
        <div>
          <Link className="wordmark" to="/">
            LearnSmith
          </Link>
          <nav aria-label="Footer">
            <Link to="/pricing">Pricing</Link>
            <Link to="/help">Help</Link>
            <Link to="/billing">Plan & billing</Link>
            <Link to="/courses">My learning</Link>
          </nav>
        </div>
        <p>
          Lessons are AI-generated and may contain mistakes. Check important
          information against reliable sources.
        </p>
      </footer>
    </div>
  );
}
