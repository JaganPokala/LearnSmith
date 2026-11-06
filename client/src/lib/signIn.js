export const GOOGLE_CONNECTION = 'google-oauth2';

// appState is restored after an external login. Only return to an app page,
// even if someone supplies an absolute URL or a protocol-relative redirect.
export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /\p{Cc}/u.test(value)) return '/courses';
  try {
    const url = new URL(value, 'https://learnsmith.invalid');
    if (url.origin !== 'https://learnsmith.invalid' || !/^\/(?:courses(?:\/[^/]+)?|lessons\/[^/]+)?$/u.test(url.pathname)) return '/courses';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/courses'; }
}

export function buildSignInOptions(provider = 'default', returnTo = '/courses') {
  if (!['default', 'google'].includes(provider)) throw new Error('Unsupported sign-in provider.');
  return {
    appState: { returnTo: safeReturnTo(returnTo) },
    ...(provider === 'google' ? { authorizationParams: { connection: GOOGLE_CONNECTION } } : {}),
  };
}

export function signInErrorMessage(error) {
  if ((error?.error ?? error?.code) === 'access_denied') {
    return 'Sign-in was cancelled or denied. You can try again.';
  }
  // Provider errors can contain URLs or operational details. Keep them out of
  // the product UI and never render arbitrary provider error descriptions.
  return 'Sign-in could not finish. Please try again or choose another sign-in option.';
}
