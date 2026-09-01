import { useAuth0 } from '@auth0/auth0-react';

export const DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN;
export const CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID;
export const AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE;

/**
 * Whether Auth0 is configured at all.
 *
 * All three values are required together — two out of three is a broken login,
 * not a partial one. Until they are set the app runs exactly as it did before
 * auth existed: every request is a guest request.
 */
export const AUTH_ENABLED = Boolean(DOMAIN && CLIENT_ID && AUDIENCE);

/**
 * What useAuth() reports when auth is switched off. Defined once at module
 * scope: a fresh literal per call would be a new reference every render and
 * would re-fire any effect depending on it.
 */
const DISABLED = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  loginWithRedirect: () => {},
  logout: () => {},
  getAccessTokenSilently: async () => null,
};

/**
 * Reads auth state. Use this everywhere rather than useAuth0 directly — it is
 * the only thing that knows auth might be unconfigured.
 */
export function useAuth() {
  // Called unconditionally, as the rules of hooks require. Outside a provider
  // auth0-react hands back its default context rather than throwing, and that
  // default has isLoading:true — which would leave a disabled app waiting
  // forever for a login that is never coming. Hence the swap, not a passthrough.
  const auth0 = useAuth0();

  return AUTH_ENABLED ? auth0 : DISABLED;
}
