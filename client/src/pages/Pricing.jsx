import { Link } from "react-router-dom";
import { usePublicPlan } from "../features/billing/usePublicPlan.js";
import { useFeatures } from "../hooks/useFeatures.js";

function Allowances({ limits, narration }) {
  return (
    <dl className="plan-allowances">
      {[
        ["courses", "Course outlines"],
        ["lessons", "Lesson generations"],
        ...(narration ? [["audio", "Narration generations"]] : []),
      ].map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>
            <strong>{limits[key]}</strong> / day
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function PricingPage() {
  const { plan, pending, error, retry } = usePublicPlan();
  const features = useFeatures();
  const pro = plan?.pro;
  const price = pro
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: pro.currency,
        maximumFractionDigits: 2,
      }).format(pro.amount / 100)
    : null;

  return (
    <main id="main-content" className="public-page home-container">
      <header className="public-intro">
        <p className="eyebrow">Room to keep learning</p>
        <h1>
          Start free.
          <br />
          <em>Create more with Pro.</em>
        </h1>
        <p>
          Choose your daily generation allowance. Learn at your own pace on
          either plan.
        </p>
      </header>
      {pending && (
        <div className="public-message" role="status">
          Loading current prices and allowances…
        </div>
      )}
      {error && (
        <div className="public-message" role="alert">
          <h2>Pricing is temporarily unavailable.</h2>
          <p>{error}</p>
          <button className="home-secondary" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {plan && (
        <>
          {plan.mode === "test" && (
            <p className="pricing-notice" role="note">
              Test mode · Checkout uses test payments. No real money is charged.
            </p>
          )}
          <div className="pricing-grid">
            <section className="plan-card" aria-labelledby="free-title">
              <p className="eyebrow">Build a learning habit</p>
              <h2 id="free-title">Free</h2>
              <p className="plan-price">
                Free <span>with an account</span>
              </p>
              <p>For exploring new topics and learning a little each day.</p>
              <Allowances
                limits={plan.freeDailyLimits}
                narration={features.tts}
              />
              <Link className="home-secondary" to="/#create-course">
                Create a course →
              </Link>
            </section>
            <section className="plan-card plan-pro" aria-labelledby="pro-title">
              <p className="eyebrow">More room to explore</p>
              <h2 id="pro-title">Pro</h2>
              <p className="plan-price">
                {price}
                <span> / month</span>
              </p>
              <p>For creating more outlines and lessons each day.</p>
              <Allowances limits={pro.dailyLimits} narration={features.tts} />
              {plan.available ? (
                <Link className="home-primary" to="/billing">
                  {plan.mode === "test"
                    ? "View test subscription"
                    : "View Pro subscription"}{" "}
                  →
                </Link>
              ) : (
                <p className="pricing-notice">
                  Pro checkout is currently unavailable. You can still use the
                  Free plan.
                </p>
              )}
            </section>
          </div>
          <p className="pricing-footnote">
            Pro renews monthly for up to {pro.totalCycles} billing cycles.
            Cancel future renewals in Plan & billing; verified paid access
            continues until its expiry. Upgrading keeps today’s usage.
          </p>
        </>
      )}
      <section className="pricing-included" aria-labelledby="included-title">
        <div>
          <p className="eyebrow">The learning experience stays the same</p>
          <h2 id="included-title">
            More allowance.
            <br />
            The same useful tools.
          </h2>
          <p>
            Pro raises generation limits. These features are shared by Free and
            Pro accounts.
          </p>
        </div>
        <ul>
          <li>Courses saved to your account</li>
          <li>Manual lesson completion and last-opened lesson</li>
          <li>Practice quizzes, explanations and saved attempts</li>
          <li>Save lessons as PDF through browser print</li>
          {features.tts && (
            <li>Hinglish narration within your daily allowance</li>
          )}
        </ul>
      </section>
      <section className="pricing-notes" aria-label="About daily allowances">
        <article>
          <h3>Trying as a guest?</h3>
          <p>
            You can try without signing in with a smaller daily allowance. Check
            the current counts on the homepage. Guest courses stay separate from
            account courses.
          </p>
        </article>
        <article>
          <h3>A fresh allowance each day.</h3>
          <p>
            Limits reset at midnight UTC. Unused allowances don’t accumulate.
            Admitted generation attempts count even if they fail; saved reads
            and audio replays use no allowance.
          </p>
        </article>
      </section>
      <div className="public-bottom">
        <p>Questions about how it works?</p>
        <Link className="home-text-link" to="/help">
          Read the help guide →
        </Link>
      </div>
    </main>
  );
}
