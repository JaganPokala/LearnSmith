import { useAuth, AUTH_ENABLED } from '../lib/auth.js';
import SignInActions from './SignInActions.jsx';
import { Link } from 'react-router-dom';

/**
 * Sign in / sign out, pinned to the bottom of the rail.
 *
 * Renders nothing at all when Auth0 is not configured — a sign-in button that
 * cannot sign anyone in is worse than no button.
 */
export default function AccountBlock() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  if (!AUTH_ENABLED) return null;

  const box = 'mt-auto border-t border-line pt-4 font-mono text-meta';

  if (isLoading) {
    return <div className={`${box} text-mute`}>checking session…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className={box}>
        <SignInActions stacked compact />
        <p className="mt-2 text-mute">Use the same sign-in method to find your saved courses. Guest courses stay separate.</p>
      </div>
    );
  }

  return (
    <div className={box}>
      {/* Profile claims are optional, so both name and email have fallbacks. */}
      <p className="truncate text-dim" title={user?.email ?? ''}>
        {user?.name ?? user?.email ?? 'signed in'}
      </p>
      <Link to="/billing" className="mt-2 block text-glow hover:underline">Subscription →</Link>

      <button
        type="button"
        // returnTo must be an Allowed Logout URL in the Auth0 dashboard, or
        // Auth0 refuses the redirect and parks the user on its own error page.
        onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        className="mt-2 text-mute hover:text-glow"
      >
        sign out
      </button>
    </div>
  );
}
