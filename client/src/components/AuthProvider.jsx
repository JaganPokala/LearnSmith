import { useCallback, useEffect } from 'react';
import { Auth0Provider } from '@auth0/auth0-react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, setTokenSource } from '../lib/api.js';
import { useAuth, AUTH_ENABLED, DOMAIN, CLIENT_ID, AUDIENCE } from '../lib/auth.js';
import { safeReturnTo, signInErrorMessage } from '../lib/signIn.js';

function AuthenticationNotice() {
  const { error, isLoading, isAuthenticated } = useAuth();
  if (!error || isLoading || isAuthenticated) return null;
  return <div role="alert" className="border-b border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
    {signInErrorMessage(error)} <Link to="/courses" className="underline">Return to sign-in</Link>
  </div>;
}

/**
 * Gives lib/api.js a way to fetch the current token, and takes it away again on
 * sign-out. Renders nothing.
 */
function TokenBridge() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      // Explicitly cleared, not just left alone: after a sign-out the previous
      // getter still resolves from cache for a while, and requests would keep
      // going out authenticated as the user who just left.
      setTokenSource(null);
      return undefined;
    }

    setTokenSource(async () => {
      try {
        return await getAccessTokenSilently();
      } catch {
        // A signed-in user's renewal failure must not turn a paid request
        // into an anonymous generation owned by a guest identity.
        throw new ApiError('Your session has expired. Sign in again.', {
          code: 'invalid_token',
          status: 401,
        });
      }
    });

    return () => setTokenSource(null);
  }, [isAuthenticated, getAccessTokenSilently]);

  return null;
}

/**
 * Wraps the app. A passthrough when auth is not configured, so no Auth0 code
 * runs and nothing is requested from a tenant that does not exist.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export default function AuthProvider({ children }) {
  const navigate = useNavigate();
  const onRedirectCallback = useCallback((appState) => {
    // Notify React Router as well as replacing the callback URL. A plain
    // history.replaceState would leave the router rendering the old page.
    navigate(safeReturnTo(appState?.returnTo), { replace: true });
  }, [navigate]);
  if (!AUTH_ENABLED) return children;

  return (
    <Auth0Provider
      domain={DOMAIN}
      clientId={CLIENT_ID}
      onRedirectCallback={onRedirectCallback}
      authorizationParams={{
        redirect_uri: window.location.origin,
        scope: 'openid profile email',

        // THE ONE THAT COSTS AN AFTERNOON. Without `audience`, Auth0 issues an
        // OPAQUE token instead of a JWT. Login succeeds, the token looks real,
        // and the backend rejects it as malformed — so you go and debug correct
        // JWT middleware. The fix is this line, on the client.
        audience: AUDIENCE,
      }}
      // Survives a full page reload. The default keeps the token in memory
      // only, so every refresh depends on a silent re-auth that fails the
      // moment third-party cookies are blocked — now the default in Safari
      // and Brave.
      cacheLocation="localstorage"
      useRefreshTokens
    >
      <TokenBridge />
      <AuthenticationNotice />
      {children}
    </Auth0Provider>
  );
}
