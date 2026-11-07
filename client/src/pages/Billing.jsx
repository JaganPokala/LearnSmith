import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { useUsage } from "../lib/usageContext.js";
import { api } from "../lib/api.js";
import { openSubscriptionCheckout } from "../lib/razorpayCheckout.js";
import BillingDetails from "../features/billing/BillingDetails.jsx";
import { useFeatures } from "../hooks/useFeatures.js";
import StateMessage from "../components/StateMessage.jsx";

function BillingScreen({ signedIn, ready }) {
  const features = useFeatures();
  const [plan, setPlan] = useState(null);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const working = useRef(false);
  const alive = useRef(false);
  const reads = useRef(0);
  const { refresh: refreshUsage } = useUsage();

  const load = useCallback(
    async ({ preserveError = false } = {}) => {
      if (working.current) return;
      const version = ++reads.current;
      try {
        const [pricing, status] = await Promise.all([
          api.get("/api/billing/plan"),
          signedIn ? api.get("/api/billing/status") : null,
        ]);
        if (alive.current && reads.current === version) {
          setPlan(pricing);
          setAccount(status?.account ?? null);
          if (!preserveError) setError(null);
        }
      } catch (err) {
        if (alive.current && reads.current === version) setError(err);
      }
    },
    [signedIn],
  );

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    // Defer the initial network read so an immediately discarded effect does
    // not start work. Save results arrive asynchronously from the API.
    if (ready)
      void Promise.resolve().then(() => {
        if (!cancelled) return load();
      });
    const onFocus = () => {
      if (ready) void load({ preserveError: true });
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      alive.current = false;
      reads.current += 1;
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, load]);

  const paidThrough = account?.paidThrough;
  useEffect(() => {
    const deadline = new Date(paidThrough).getTime();
    const delay = deadline - Date.now();
    if (!paidThrough || !Number.isFinite(delay) || delay <= 0) return undefined;
    // Monthly periods can exceed the browser's ~24.8-day timeout maximum.
    let timer;
    const check = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        void load();
        return;
      }
      timer = setTimeout(check, Math.min(remaining + 1000, 2147483647));
    };
    timer = setTimeout(check, Math.min(delay + 1000, 2147483647));
    return () => clearTimeout(timer);
  }, [paidThrough, load]);

  async function action(operation) {
    if (working.current) return;
    working.current = true;
    reads.current += 1;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (operation === "subscribe") {
        const setup = await api.postAction("/api/billing/checkout");
        if (!alive.current) return;
        if (setup.checkout.mode !== plan.mode)
          throw new Error(
            "Payment mode changed. Refresh this page before continuing.",
          );
        setAccount(setup.account);
        const result = await openSubscriptionCheckout(setup.checkout);
        if (!alive.current) return;
        if (result.status !== "completed") {
          setNotice(
            result.status === "failed"
              ? "Checkout did not finish here. Refresh status before trying again."
              : "Checkout closed. Refresh status if a payment completed; closing this window does not confirm a payment result.",
          );
          return;
        }
        const verified = await api.postAction(
          "/api/billing/verify",
          result.response,
        );
        if (!alive.current) return;
        setAccount(verified.account);
        setNotice(
          verified.account.tier === "pro"
            ? "Payment verified. Your Pro limits are active."
            : "Checkout finished. Paid access is not confirmed yet. Use Refresh status to check again.",
        );
      } else {
        const result = await api.postAction(`/api/billing/${operation}`);
        if (!alive.current) return;
        setAccount(result.account);
        setConfirmCancel(false);
        setNotice(
          operation === "cancel"
            ? "Future renewals are stopped. Any remaining paid access continues until its expiry."
            : "Subscription status checked.",
        );
      }
    } catch (err) {
      if (alive.current) setError(err);
    } finally {
      working.current = false;
      if (alive.current) {
        setBusy(false);
        // A lost response or dismissed window does not prove the server did
        // nothing. Re-read saved state without opening another paid checkout.
        void refreshUsage();
        void load({ preserveError: true });
      }
    }
  }

  if (!ready || (!plan && !error))
    return (
      <StateMessage kind="loading" title="Loading subscription details…" />
    );
  return (
    <div className="learning-page billing-page">
      <header className="learning-heading">
        <div>
          <p className="learning-eyebrow">Your account</p>
          <h1>Plan & billing</h1>
          <p>Manage your allowance, subscription and future renewals.</p>
        </div>
        <Link to="/courses" className="learning-link">
          Back to my learning →
        </Link>
      </header>
      {error && (
        <div role="alert" className="billing-message text-danger">
          <p>{error.message}</p>
          {!plan && (
            <button type="button" onClick={load} className="learning-link mt-3">
              Try again
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="billing-message">
          {notice}
        </p>
      )}
      {plan && (
        <BillingDetails
          plan={plan}
          account={account}
          signedIn={signedIn}
          busy={busy}
          confirmCancel={confirmCancel}
          setConfirmCancel={setConfirmCancel}
          onAction={action}
          narration={features.tts}
        />
      )}
    </div>
  );
}

export default function BillingPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  return (
    <BillingScreen
      key={
        isLoading
          ? "loading"
          : isAuthenticated
            ? (user?.sub ?? "user")
            : "guest"
      }
      signedIn={isAuthenticated}
      ready={!isLoading}
    />
  );
}
