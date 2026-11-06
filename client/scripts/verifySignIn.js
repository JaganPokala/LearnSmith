import assert from 'node:assert/strict';
import { buildSignInOptions, safeReturnTo, signInErrorMessage } from '../src/lib/signIn.js';

const google = buildSignInOptions('google');
assert.deepEqual(google, { appState: { returnTo: '/courses' }, authorizationParams: { connection: 'google-oauth2' } });
assert.deepEqual(buildSignInOptions(), { appState: { returnTo: '/courses' } });
assert.equal(google.authorizationParams.audience, undefined, 'Keep the configured API audience inherited from Auth0Provider.');
assert.equal(google.authorizationParams.redirect_uri, undefined, 'Do not replace the allowlisted provider callback with a new URL.');
assert.throws(() => buildSignInOptions('untrusted-connection'), /Unsupported/);
console.log('PASS: Google uses the configured social connection; other sign-in options retain Universal Login and provider-level audience/callback settings.');

for (const value of [undefined, null, 4, '', 'https://evil.example', '//evil.example', '/\\evil.example', '\\evil.example',
  'javascript:alert(1)', '/courses\n//evil.example', '/courses/../../redirect', '/api/usage', '/unknown']) {
  assert.equal(safeReturnTo(value), '/courses', `Unsafe or unsupported return target: ${JSON.stringify(value)}`);
}
for (const value of ['/', '/courses', '/courses?tab=recent', '/courses/111111111111111111111111',
  '/lessons/222222222222222222222222#lesson-section-1']) {
  assert.equal(safeReturnTo(value), value);
}
assert.equal(buildSignInOptions('google', '//evil.example').appState.returnTo, '/courses');
console.log('PASS: Post-login navigation stays on supported app routes and rejects external URLs, backslashes, control characters, and API paths.');

assert.match(signInErrorMessage({ error: 'access_denied' }), /cancelled or denied/);
assert.match(signInErrorMessage({ code: 'access_denied' }), /cancelled or denied/);
const privateError = { error: 'server_error', message: 'secret-provider-details', error_description: '<script>untrusted</script>' };
assert.equal(signInErrorMessage(privateError), signInErrorMessage(new Error('offline')));
assert.doesNotMatch(signInErrorMessage(privateError), /secret-provider-details|script|untrusted/);
console.log('PASS: Cancellation is understandable; arbitrary provider errors and descriptions are not shown to users.');
