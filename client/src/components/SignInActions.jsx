import { useRef, useState } from 'react';
import { useAuth, AUTH_ENABLED } from '../lib/auth.js';
import { buildSignInOptions, signInErrorMessage } from '../lib/signIn.js';

export default function SignInActions({ stacked = false, compact = false, returnTo = '/courses' }) {
  const { loginWithRedirect, isLoading, isAuthenticated } = useAuth();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  if (!AUTH_ENABLED || isLoading || isAuthenticated) return null;

  async function signIn(provider) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(provider);
    setError(null);
    try { await loginWithRedirect(buildSignInOptions(provider, returnTo)); }
    catch (err) { setError(signInErrorMessage(err)); }
    finally { inFlight.current = false; setPending(null); }
  }

  const button = `border px-3 py-2 ${compact ? 'text-xs' : 'text-sm'} disabled:cursor-wait disabled:opacity-50`;
  return (
    <div className={stacked ? 'w-full' : 'max-w-full'}>
      <div className={`flex gap-2 ${stacked ? 'flex-col' : 'flex-wrap items-center'}`} aria-busy={pending !== null}>
        <button type="button" onClick={() => signIn('google')} disabled={pending !== null}
          className={`${button} border-accent-line bg-accent-bg font-semibold text-glow hover:border-glow hover:bg-raised`}>
          {pending === 'google' ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <button type="button" onClick={() => signIn('default')} disabled={pending !== null}
          className={`${button} border-line-strong text-dim hover:border-accent hover:text-ink`}>
          {pending === 'default' ? 'Opening sign-in…' : 'Other sign-in options'}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 max-w-[40ch] text-xs leading-relaxed text-danger">{error}</p>}
    </div>
  );
}
