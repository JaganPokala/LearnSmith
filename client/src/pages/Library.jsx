import { useEffect } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useCourses } from "../hooks/useCourses.js";
import StateMessage from "../components/StateMessage.jsx";

import { useAuth, AUTH_ENABLED } from "../lib/auth.js";
import SignInActions from "../components/SignInActions.jsx";
import LibraryCourses from "../features/courses/LibraryCourses.jsx";

function LibraryContent({ signedIn, authLoading }) {
  const { data, loading, error, refetch } = useCourses(
    signedIn && !authLoading,
  );
  const { setRail } = useOutletContext();
  useEffect(() => {
    setRail(null);
  }, [setRail]);

  return (
    <div className="learning-page">
      <header className="learning-heading">
        <div>
          <p className="learning-eyebrow">A place to keep going</p>
          <h1>My learning</h1>
          <p>Your courses and a place to pick up where you left off.</p>
        </div>
        <Link className="learning-button" to="/courses/new">
          Create a course →
        </Link>
      </header>
      {authLoading ? (
        <StateMessage kind="loading" title="Checking your session…" />
      ) : !signedIn ? (
        <section className="learning-empty">
          <p className="learning-eyebrow">Your account library</p>
          <h2>
            {AUTH_ENABLED
              ? "Your learning, saved in one place."
              : "Account sign-in is unavailable."}
          </h2>
          <p>
            {AUTH_ENABLED
              ? "Sign in to find the courses created with your account and their saved progress."
              : "You can still try creating a guest course on this deployment."}
          </p>
          {AUTH_ENABLED && <SignInActions returnTo="/courses" />}
          <p className="learning-guest-note">
            Already created a guest course? Open its saved link in the same
            browser. Access depends on your guest cookie. Guest courses do not
            appear in this account library or transfer on sign-in.
          </p>
        </section>
      ) : loading || (!data && !error) ? (
        <StateMessage kind="loading" title="Loading your learning…" />
      ) : error ? (
        <StateMessage
          kind="error"
          title="Your courses couldn’t load."
          detail={error.message}
          action={
            <button className="learning-button secondary" onClick={refetch}>
              Try again
            </button>
          }
        />
      ) : !data.courses.length ? (
        <section className="learning-empty">
          <p className="learning-eyebrow">Begin with curiosity</p>
          <h2>Your first course starts with a question.</h2>
          <p>
            Choose something you’d like to learn. We’ll create an outline you
            can work through at your own pace.
          </p>
          <Link className="learning-button" to="/courses/new">
            Create your first course →
          </Link>
        </section>
      ) : (
        <LibraryCourses courses={data.courses} onDeleted={refetch} />
      )}
    </div>
  );
}

export default function LibraryPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  // Remount account-owned list state when identity changes, including search and
  // pending reads. Never carry a previous account's courses into a new session.
  return (
    <LibraryContent
      key={
        isLoading
          ? "loading"
          : isAuthenticated
            ? (user?.sub ?? "account")
            : "guest"
      }
      signedIn={isAuthenticated}
      authLoading={isLoading}
    />
  );
}
