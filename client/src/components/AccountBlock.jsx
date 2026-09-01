import { useAuth, AUTH_ENABLED } from '../lib/auth.js';

/**
 * Sign in / sign out, pinned to the bottom of the rail.
 *
 * Renders nothing at all when Auth0 is not configured — a sign-in button that
 * cannot sign anyone in is worse than no button.
 */
export default function AccountBlock() {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout } = useAuth();

  if (!AUTH_ENABLED) return null;

  const box = 'mt-auto border-t border-line pt-4 font-mono text-meta';

  if (isLoading) {
    return <div className={`${box} text-mute`}>checking session…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className={box}>
        <button
          type="button"
          onClick={() => loginWithRedirect()}
          className="w-full border border-accent-line bg-accent-bg px-3 py-[7px] text-left text-glow hover:border-glow hover:bg-raised"
        >
          sign in →
        </button>

        <p className="mt-2 text-mute">courses you make now are not saved to an account</p>
      </div>
    );
  }

  return (
    <div className={box}>
      {/* The name is whatever the connection supplied; email is the only field
          every connection sets, so it is the fallback rather than the first
          choice. Truncated because a Google display name can be long. */}
      <p className="truncate text-dim" title={user?.email ?? ''}>
        {user?.name ?? user?.email ?? 'signed in'}
      </p>

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
