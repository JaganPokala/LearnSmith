/**
 * Who is making this request.
 *
 * Two middlewares, and the difference between them is the whole design:
 *
 *   attachUser   verify a token IF one was sent, then move on either way.
 *                Never rejects. Every route uses this.
 *   requireUser  401 when attachUser did not find a verified user.
 *                Exactly one route uses this: GET /api/courses.
 *
 * That split exists because a visitor with no account must still be able to
 * generate a course and read its lessons — that is the promise the landing page
 * makes. Only the library is private.
 */

import { auth } from 'express-oauth2-jwt-bearer';
import { config } from '../config/env.js';
import { ApiError } from './errorHandler.js';

/** Every course a signed-out visitor creates belongs to this one shared id. */
export const GUEST_CREATOR = 'guest-user';

// 1. BUILD THE VERIFIER ONCE, AT MODULE LOAD — not per request.
//
//    `auth({ issuerBaseURL, audience })` from express-oauth2-jwt-bearer returns
//    an Express middleware. It fetches your tenant's public signing keys (JWKS)
//    on first use and caches them. Building it per request would re-fetch those
//    keys on every call: a network round trip to Auth0 in front of every
//    request, and a rate limit you will eventually hit.
//
//    But it can only be built when the config exists. `config.AUTH0_ISSUER` is
//    null until Task 8.1 is done, and calling auth() with null throws AT IMPORT
//    TIME — which takes the whole server down at boot, before any route runs.
//    So build it conditionally and keep the app working without it.
//
//    const verify = config.features.auth ? auth({ ... }) : null;
//
//    Check what config exposes before you write this — is it `config.features`
//    or a separate export? Look at how server.js reads it.

// 2. WHAT MUST BE CHECKED BESIDES THE SIGNATURE. There are two, and skipping
//    either one is a real hole rather than a lint nit:
//
//      issuer   — a signature proves a token was minted by SOMEONE whose key
//                 you fetched. Pin the issuer and it proves WHICH tenant.
//      audience — a token minted for a different API of the same tenant is
//                 correctly signed and correctly issued and is still not for
//                 you. Without this check, any Auth0 token from your tenant
//                 opens your API.
//
//    Both are arguments to auth(). Name them explicitly; do not rely on a
//    default. Note the formats differ — one wants the trailing slash, the
//    other is the identifier string exactly as typed in the dashboard.

/**
 * Verify a bearer token when one is present. Sets `req.creator`.
 *
 * ALWAYS calls next() when there is no token — that is a guest, not an error.
 *
 * @type {import('express').RequestHandler}
 */
export function attachUser(req, res, next) {
  // 3. THE NO-CONFIG CASE FIRST. When auth is switched off, every request is a
  //    guest request and this is a one-line no-op. Get this branch right and
  //    the app keeps working for the whole of Phase 8 while you build it.
  //
  // 4. NO Authorization HEADER -> guest. Set req.creator = GUEST_CREATOR and
  //    next(). Do not call the verifier: it rejects a missing token, and that
  //    401 would break generation for every visitor.
  //
  //    Check for the header itself, not for a truthy req.auth — req.auth does
  //    not exist yet at this point.
  //
  // 5. A HEADER IS PRESENT -> run the verifier, and it is an ERROR-FIRST
  //    CALLBACK, not a promise. It is Express middleware, so you call it as
  //    verify(req, res, (err) => { ... }) and branch inside that callback.
  //    Returning it or awaiting it will not work.
  //
  // 6. THE DECISION THIS FILE TURNS ON: a token that is PRESENT but INVALID —
  //    expired, wrong audience, garbage. Two options:
  //
  //      (a) treat it as a guest and carry on
  //      (b) 401
  //
  //    Pick one and write down why. Consider: (a) means a user whose session
  //    expired silently starts writing courses into `guest-user` instead of
  //    their own account, and sees an empty library with no error to explain
  //    it. Consider also which one a bug in YOUR token code looks like.
  //
  //    Whichever you choose, use ApiError so it goes through errorHandler and
  //    comes out in the same envelope as everything else — the client's
  //    lib/errors.js branches on `code`, so invent one and it needs an entry.
  //
  // 7. ON SUCCESS the verifier sets `req.auth`. The user id is
  //    `req.auth.payload.sub` — a string like "auth0|65f0c3...".
  //
  //    NOT the email. Email is absent from an access token unless you add it
  //    with a custom claim, it changes when a user changes it, and it is not
  //    unique across connections — the same person signing in with Google and
  //    with a password is two accounts with one email. `sub` is the only
  //    identifier Auth0 promises is stable and unique.
  //
  //    Assign it to req.creator. Nothing downstream should ever read req.auth
  //    again: one place converts a token into an owner, and that is here.
}

/**
 * Reject anyone who is not signed in. Must run AFTER attachUser.
 *
 * @type {import('express').RequestHandler}
 */
export function requireUser(req, res, next) {
  // 8. The test is NOT "is req.creator set" — attachUser always sets it. It is
  //    "is req.creator a real user", i.e. not the guest id.
  //
  // 9. WHEN AUTH IS SWITCHED OFF, what should this do? There is no way to sign
  //    in, so a strict check makes the library permanently unreachable and the
  //    app looks broken to you while you are still building. A permissive check
  //    ships a private route that is not private. Decide, and leave a comment
  //    saying which — this is the line that becomes a security hole if the
  //    reasoning is not written down next to it.
  //
  // 10. 401, not 403. 401 means "I do not know who you are"; 403 means "I know,
  //     and you may not". Give it a code the client can branch on, and add the
  //     matching entry to client/src/lib/errors.js with retry:false — retrying
  //     the same anonymous request cannot ever succeed.
}

/**
 * The owner to use for this request's queries.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export function creatorOf(req) {
  // 11. One line. It exists so the controllers never reach into req.auth
  //     themselves, and so there is exactly ONE place that decides what an
  //     unauthenticated owner is called.
  //
  //     Fall back to GUEST_CREATOR rather than trusting req.creator to be set:
  //     a route that forgets attachUser would otherwise query
  //     { creator: undefined }, which in Mongoose matches documents where the
  //     field is missing — a query that quietly returns the wrong rows instead
  //     of failing.
}
