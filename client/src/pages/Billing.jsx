import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { useUsage } from '../lib/usageContext.js';
import { api } from '../lib/api.js';
import { openSubscriptionCheckout } from '../lib/razorpayCheckout.js';
import SignInActions from '../components/SignInActions.jsx';
import StateMessage from '../components/StateMessage.jsx';

function BillingScreen({ signedIn, ready }) {
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

  const load = useCallback(async ({ preserveError = false } = {}) => {
    if (working.current) return;
    const version = ++reads.current;
    try {
      const [pricing, status] = await Promise.all([api.get('/api/billing/plan'), signedIn ? api.get('/api/billing/status') : null]);
      if (alive.current && reads.current === version) { setPlan(pricing); setAccount(status?.account ?? null); if (!preserveError) setError(null); }
    } catch (err) { if (alive.current && reads.current === version) setError(err); }
  }, [signedIn]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    // Defer the initial network read so an immediately discarded effect does
    // not start work. Save results arrive asynchronously from the API.
    if (ready) void Promise.resolve().then(() => { if (!cancelled) return load(); });
    const onFocus = () => { if (ready) void load({ preserveError: true }); };
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; alive.current = false; reads.current += 1; window.removeEventListener('focus', onFocus); };
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
      if (remaining <= 0) { void load(); return; }
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
      if (operation === 'subscribe') {
        const setup = await api.postAction('/api/billing/checkout');
        if (!alive.current) return;
        if (setup.checkout.mode !== plan.mode) throw new Error('Payment mode changed. Refresh this page before continuing.');
        setAccount(setup.account);
        const result = await openSubscriptionCheckout(setup.checkout);
        if (!alive.current) return;
        if (result.status !== 'completed') {
          setNotice(result.status === 'failed' ? 'Checkout did not finish here. Refresh status before trying again.' : 'Checkout closed. Refresh status if a payment completed; closing this window does not confirm a payment result.');
          return;
        }
        const verified = await api.postAction('/api/billing/verify', result.response);
        if (!alive.current) return;
        setAccount(verified.account);
        setNotice(verified.account.tier === 'pro' ? 'Payment verified. Your Pro limits are active.' : 'Checkout finished. Paid access is not confirmed yet. Use Refresh status to check again.');
      } else {
        const result = await api.postAction(`/api/billing/${operation}`);
        if (!alive.current) return;
        setAccount(result.account);
        setConfirmCancel(false);
        setNotice(operation === 'cancel' ? 'Future renewals are stopped. Any remaining paid access continues until its expiry.' : 'Subscription status checked.');
      }
    } catch (err) { if (alive.current) setError(err); }
    finally {
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

  if (!ready || (!plan && !error)) return <StateMessage kind="loading" title="Loading subscription details…" />;
  const pro = plan?.pro;
  const price = pro ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: pro.currency, maximumFractionDigits: 0 }).format(pro.amount / 100) : null;
  const button = 'border border-accent-line px-4 py-2 text-sm text-glow hover:border-glow disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className="max-w-[760px]">
      <Link to="/courses" className="text-sm text-dim hover:text-glow">← Your library</Link>
      <h1 className="mt-4 text-title font-bold text-ink">Your subscription</h1>
      {plan?.mode === 'test' && <p className="mt-2 text-sm text-warn">Test mode · no real money is charged.</p>}
      {plan?.mode === 'live' && <p className="mt-2 text-sm text-dim">Payments are real. Your subscription renews monthly until cancelled or its final cycle.</p>}
      {error && <p role="alert" className="mt-4 border border-danger-line p-3 text-sm text-danger">{error.message} {!plan && <button type="button" onClick={load} className="underline">Try again</button>}</p>}
      {notice && <p role="status" className="mt-4 border border-line p-3 text-sm text-dim">{notice}</p>}
      {pro && <section className="mt-6 border border-line bg-panel p-5" aria-label="Pro plan">
        <h2 className="text-xl font-semibold text-ink">{pro.name} · {price}/month</h2>
        <p className="mt-3 text-sm text-dim">Daily allowance: {pro.dailyLimits.courses} courses · {pro.dailyLimits.lessons} lessons · {pro.dailyLimits.audio} narrations.</p>
        <p className="mt-2 text-xs text-mute">Monthly recurring billing for up to {pro.totalCycles} cycles. Cancel future renewals anytime. Allowances reset at midnight UTC; upgrading keeps today’s usage.</p>
        {!signedIn ? <div className="mt-5"><p className="mb-3 text-sm text-dim">Sign in to subscribe.</p><SignInActions returnTo="/billing" /></div> : <>
          <p className="mt-4 text-sm text-ink">Current plan: {account?.tier === 'pro' ? (plan.mode === 'test' ? 'Pro · test' : 'Pro') : account ? 'Free' : 'Loading…'}</p>
          {account?.status !== 'none' && account && <p className="mt-2 text-sm text-dim">Subscription status: {account.status}{account.renewalStopped ? ' · renewal stopped' : ''}</p>}
          {account?.paidThrough && <p className="mt-2 text-sm text-dim">Paid access {new Date(account.paidThrough) > new Date() ? 'until' : 'expired'}: <time dateTime={account.paidThrough}>{new Date(account.paidThrough).toLocaleString()}</time></p>}
          {!plan.available && <p className="mt-4 text-sm text-warn">Subscription checkout is not available on this deployment yet.</p>}
          {['creating', 'unknown'].includes(account?.checkoutState) && <p className="mt-4 text-sm text-warn">Checkout setup needs confirmation before another subscription can be created.</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => action('subscribe')} disabled={busy || !plan.available || !account || account.tier === 'pro' || ['creating', 'unknown'].includes(account.checkoutState)} className={button}>{busy ? 'Working…' : account?.canCheckout ? 'Resume checkout' : plan.mode === 'test' ? 'Subscribe in test mode' : `Subscribe for ${price}/month`}</button>
            <button type="button" onClick={() => action('sync')} disabled={busy || !plan.available} className={button}>Refresh status</button>
            {account?.canCancel && <button type="button" onClick={() => setConfirmCancel(true)} disabled={busy} className={`${button} text-danger`}>Cancel renewal</button>}
          </div>
          {confirmCancel && <div className="mt-4 border border-line-strong p-4 text-sm">
            <p className="text-dim">Stop future renewals? You keep any time already paid for. A new subscription will be needed after that period ends.</p>
            <div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => action('cancel')} disabled={busy} className={button}>Confirm cancellation</button><button type="button" onClick={() => setConfirmCancel(false)} disabled={busy} className={button}>Keep subscription</button></div>
          </div>}
        </>}
      </section>}
      {plan?.freeDailyLimits && <p className="mt-5 text-sm text-mute">Free account: {plan.freeDailyLimits.courses} courses, {plan.freeDailyLimits.lessons} lessons, and {plan.freeDailyLimits.audio} narrations per day. Saved content stays accessible when an allowance is exhausted.</p>}
    </div>
  );
}

export default function BillingPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  return <BillingScreen key={isLoading ? 'loading' : isAuthenticated ? user?.sub ?? 'user' : 'guest'} signedIn={isAuthenticated} ready={!isLoading} />;
}
