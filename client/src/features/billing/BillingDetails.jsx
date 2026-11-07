import { Link } from "react-router-dom";
import SignInActions from "../../components/SignInActions.jsx";
import {
  subscriptionMessage,
  paidThroughLabel,
} from "./billingPresentation.js";

// Rendering is separate from the action owner so payment operations stay explicit
// and this component can be reviewed with account-state fixtures.
export default function BillingDetails({
  plan,
  account,
  signedIn,
  busy,
  confirmCancel,
  setConfirmCancel,
  onAction,
  narration,
}) {
  const pro = plan.pro;
  const price = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: pro.currency,
    maximumFractionDigits: 2,
  }).format(pro.amount / 100);
  const paidThrough = paidThroughLabel(account?.paidThrough);
  return (
    <>
      {plan.mode === "test" && (
        <p className="billing-message text-warn">
          Test mode · No real money is charged.
        </p>
      )}
      <section className="billing-plan" aria-label="Your plan and subscription">
        <div>
          <p className="learning-eyebrow">
            {signedIn ? "Your current plan" : "More room to learn"}
          </p>
          <h2 className="mt-3">
            {signedIn
              ? account?.tier === "pro"
                ? "LearnSmith Pro"
                : account
                  ? "Free plan"
                  : "Checking your plan…"
              : "LearnSmith Pro"}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-dim">
            {signedIn
              ? subscriptionMessage(account)
              : "Increase your daily generation allowance. Your learning tools stay the same."}
          </p>
          {paidThrough && (
            <p className="mt-4 text-sm text-dim">
              Paid access{" "}
              {new Date(account.paidThrough) > new Date() ? "until" : "expired"}{" "}
              <time dateTime={account.paidThrough}>{paidThrough}</time>.
            </p>
          )}
          {signedIn ? (
            <div className="billing-actions">
              <button
                className="learning-button secondary"
                onClick={() => onAction("sync")}
                disabled={busy || !plan.available}
              >
                Refresh subscription status
              </button>
              {account?.canCancel && (
                <button
                  className="learning-link text-danger"
                  onClick={() => setConfirmCancel(true)}
                  disabled={busy}
                >
                  Cancel renewal
                </button>
              )}
            </div>
          ) : (
            <details className="mt-6">
              <summary className="learning-button">Sign in to continue</summary>
              <div className="mt-4">
                <SignInActions returnTo="/billing" />
              </div>
            </details>
          )}
          <Link to="/pricing" className="learning-link">
            Compare Free and Pro →
          </Link>
        </div>
        <div className="billing-summary">
          <p className="learning-eyebrow">Pro allowance</p>
          <h3 className="mt-3">
            {price}
            <span className="text-sm font-normal text-dim"> / month</span>
          </h3>
          <dl className="billing-limit-list">
            {[
              ["courses", "Course outlines"],
              ["lessons", "Lesson generations"],
              ...(narration ? [["audio", "Narrations"]] : []),
            ].map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{pro.dailyLimits[key]} / day</dd>
              </div>
            ))}
          </dl>
          {!plan.available ? (
            <p className="mt-5 text-sm text-warn">
              Checkout is currently unavailable. Saved learning remains
              accessible.
            </p>
          ) : (
            signedIn &&
            account?.tier !== "pro" && (
              <button
                type="button"
                className="learning-button mt-6"
                onClick={() => onAction("subscribe")}
                disabled={
                  busy ||
                  !account ||
                  ["creating", "unknown"].includes(account.checkoutState)
                }
              >
                {busy
                  ? "Working…"
                  : account?.canCheckout
                    ? "Continue checkout"
                    : plan.mode === "test"
                      ? "Try Pro test checkout"
                      : `Get Pro — ${price}/month`}
              </button>
            )
          )}
          {["creating", "unknown"].includes(account?.checkoutState) && (
            <p className="mt-4 text-sm text-warn">
              Refresh status before attempting another checkout.
            </p>
          )}
        </div>
      </section>
      {confirmCancel && (
        <section className="billing-message" aria-label="Confirm cancellation">
          <h2 className="text-lg font-semibold">Cancel future renewals?</h2>
          <p className="mt-3">
            {paidThrough && account?.tier === "pro"
              ? `You keep Pro access until ${paidThrough}.`
              : "Any verified time already paid for remains available until its expiry."}{" "}
            A new subscription will be needed when that access ends.
          </p>
          <div className="billing-actions">
            <button
              className="learning-button"
              disabled={busy}
              onClick={() => onAction("cancel")}
            >
              Confirm cancellation
            </button>
            <button
              className="learning-button secondary"
              disabled={busy}
              onClick={() => setConfirmCancel(false)}
            >
              Keep renewal
            </button>
          </div>
        </section>
      )}
      <section className="billing-message">
        <h2 className="text-base font-semibold">
          How billing and allowances work
        </h2>
        <p className="mt-3 text-dim">
          Monthly recurring billing for up to {pro.totalCycles} cycles. Cancel
          future renewals from this page. Paid-access expiry is not a guaranteed
          next charge date.
        </p>
        <p className="mt-3 text-dim">
          Allowances reset at midnight UTC. Upgrading keeps today’s usage. Saved
          lessons remain readable when your daily allowance is exhausted.
        </p>
        {plan.freeDailyLimits && (
          <p className="mt-3 text-dim">
            Free account: {plan.freeDailyLimits.courses} course outlines and{" "}
            {plan.freeDailyLimits.lessons} lesson generations
            {narration ? `, plus ${plan.freeDailyLimits.audio} narrations` : ""}{" "}
            per day.
          </p>
        )}
      </section>
    </>
  );
}
