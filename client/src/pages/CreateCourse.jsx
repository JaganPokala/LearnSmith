import { useEffect } from "react";
import { Link, useOutletContext } from "react-router-dom";
import PromptForm from "../components/PromptForm.jsx";
import { AUTH_ENABLED, useAuth } from "../lib/auth.js";
import SignInActions from "../components/SignInActions.jsx";
import { useUsage } from "../lib/usageContext.js";

export default function CreateCoursePage() {
  const { setRail } = useOutletContext();
  const { isAuthenticated, isLoading } = useAuth();
  const { data, error, refresh, pending } = useUsage();
  useEffect(() => {
    setRail(null);
  }, [setRail]);
  const quota = data?.quota?.courses;

  return (
    <div className="learning-page creation-page">
      <Link className="learning-link" to="/courses">
        ← My learning
      </Link>
      <header className="learning-heading">
        <div>
          <p className="learning-eyebrow">Start with a question</p>
          <h1>What would you like to learn?</h1>
          <p>
            Add a little context about your experience or what you want to
            achieve.
          </p>
        </div>
      </header>
      <section className="creation-form" aria-label="Create a course outline">
        <PromptForm variant="creation" />
        <p className="learning-helper">
          You’ll get a course outline first. Generate individual lessons when
          you’re ready.
        </p>
        <div className="creation-allowance" role="status">
          {quota ? (
            <p className={quota.remaining === 0 ? "text-warn" : ""}>
              {quota.remaining} of {quota.limit} course outlines left today.
              {quota.remaining === 0 &&
                " You can still read saved lessons. Open Daily allowance above for reset details."}
            </p>
          ) : (
            <p>
              {error
                ? "Allowance unavailable. You can refresh the current counts."
                : "Checking your course allowance…"}
            </p>
          )}
          {error && (
            <button
              className="learning-link"
              onClick={refresh}
              disabled={pending}
            >
              Refresh allowance
            </button>
          )}
        </div>
      </section>
      {!isLoading && !isAuthenticated && (
        <section className="creation-account">
          <h2>Want this course in your account?</h2>
          <p>
            Sign in before creating it. Guest courses stay separate and need
            their saved link and this browser’s guest cookie to revisit.
          </p>
          {AUTH_ENABLED && <SignInActions returnTo="/courses/new" />}
        </section>
      )}
      <p className="learning-helper">
        Lessons are AI-generated and may contain mistakes. Check important
        information against reliable sources.
      </p>
    </div>
  );
}
