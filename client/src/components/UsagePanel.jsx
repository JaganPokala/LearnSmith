import { useUsage } from '../lib/usageContext.js';
import { AUTH_ENABLED, useAuth } from '../lib/auth.js';

const RESOURCES = [['courses', 'Courses'], ['lessons', 'Lessons'], ['audio', 'Narrations']];

export default function UsagePanel({ compact = false }) {
  const { data, error, pending, ready, refresh } = useUsage();
  const { isAuthenticated, loginWithRedirect } = useAuth();
  const reset = data?.resetAt ? new Date(data.resetAt) : null;
  const resetLabel = reset && Number.isFinite(reset.getTime())
    ? new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(reset)
    : null;

  const panel = (
    <section aria-label="Daily generation allowance" aria-busy={pending || !ready} className="mb-6 border border-line bg-panel p-3 text-left print:hidden sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-dim">
          Daily allowance <span className="text-mute">· {ready ? (isAuthenticated ? 'Free account' : 'Guest') : 'Checking account'}</span>
        </h2>
        <button type="button" onClick={refresh} disabled={pending || !ready} className="text-xs text-glow hover:underline disabled:cursor-wait disabled:text-mute">
          {pending ? 'Updating…' : 'Refresh allowance'}
        </button>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {RESOURCES.map(([resource, label]) => {
          const quota = data?.quota?.[resource];
          const exhausted = quota?.remaining === 0;
          return (
            <div key={resource} className={`min-w-0 border px-2 py-2 sm:px-3 ${exhausted ? 'border-warn-line bg-warn-bg' : 'border-line bg-ground'}`}>
              <dt className="text-xs text-dim">{label}</dt>
              <dd className={`mt-1 text-sm ${exhausted ? 'text-warn' : 'text-ink'}`}>
                {quota ? <><strong className="text-lg tabular-nums">{quota.remaining}</strong> of {quota.limit} left</> : <span aria-label="Not loaded">—</span>}
                {exhausted && <p className="mt-1 text-xs text-warn">Daily limit reached</p>}
              </dd>
            </div>
          );
        })}
      </dl>

      <div role="status" aria-live="polite" className="mt-3 text-xs text-mute">
        {error ? (
          <p className="text-warn">
            {data ? 'Could not refresh; these are the last checked counts.' : 'Could not load your allowance. Saved content is still accessible.'}
            {error.code === 'invalid_token' ? ' Sign in again to refresh it.' : ' Try refreshing the allowance.'}
          </p>
        ) : !data ? <p>{ready ? 'Loading today’s allowance…' : 'Checking your account…'}</p> : (
          <p>Resets {resetLabel ? <time dateTime={data.resetAt}>{resetLabel}</time> : 'at midnight UTC'}.</p>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-mute">Saved lessons and audio use no allowance. Generation attempts count even when they fail.</p>
      {AUTH_ENABLED && ready && !isAuthenticated && (
        <button type="button" onClick={() => loginWithRedirect()} className="mt-2 text-xs text-glow hover:underline">Sign in for higher daily limits</button>
      )}
    </section>
  );

  if (!compact) return panel;
  return (
    <details className="mb-6 max-w-[720px] print:hidden">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-line px-3 py-2.5 text-xs text-dim hover:bg-panel focus-visible:outline-2 focus-visible:outline-glow">
        <span>Daily allowance <span aria-hidden="true" className="ml-1 text-mute">⌄</span></span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {RESOURCES.map(([resource, label]) => <span key={resource} className={data?.quota?.[resource]?.remaining === 0 ? 'text-warn' : ''}>{data?.quota?.[resource]?.remaining ?? '—'} {label.toLowerCase()} left</span>)}
          {error && <span className="text-warn">Refresh needed</span>}
        </span>
      </summary>
      <div className="mt-3">{panel}</div>
    </details>
  );
}
