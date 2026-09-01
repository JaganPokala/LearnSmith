/**
 * Who is making this request.
 *
 * Two middlewares, and the difference between them is the whole design:
 *
 *   attachUser   verify a token IF one was sent, then continue either way.
 *                Never rejects a request that simply has no token.
 *   requireUser  401 when attachUser did not find a real user.
 *
 * That split exists because a visitor with no account must still generate a
 * course and read its lessons — that is what the landing page promises. Only
 * the library is private.
 */

import { auth } from 'express-oauth2-jwt-bearer';
import { config, features } from '../config/env.js';
import { ApiError } from './errorHandler.js';

/** Every course a signed-out visitor creates belongs to this one shared id. */
export const GUEST_CREATOR = 'guest-user';

// Built ONCE at module load. The verifier fetches the tenant's public signing
// keys on first use and caches them; rebuilding it per request would put a
// round trip to Auth0 in front of every call.
//
// Conditional because auth() throws when issuerBaseURL is undefined, and it
// would throw HERE — at import time — taking the server down at boot rather
// than failing one request.
//
// Both checks are named explicitly. The signature alone only proves some key we
// fetched signed this; `issuer` pins which tenant, and `audience` pins which
// API within it. Without the audience check, a token minted for any other API
// in the same tenant opens this one.
const verify = features.auth
  ? auth({
      issuerBaseURL: config.AUTH0_ISSUER,
      audience: config.AUTH0_AUDIENCE,
    })
  : null;

/**
 * Verify a bearer token when one is present. Always sets `req.creator`.
 *
 * @type {import('express').RequestHandler}
 */
export function attachUser(req, res, next) {
  // Auth switched off: there is nobody to be, so everybody is the guest. This
  // branch is what let the app keep working through the whole of Phase 8.
  if (!verify) {
    req.creator = GUEST_CREATOR;
    return next();
  }

  // No token at all is the NORMAL case here, not an error — it is every
  // first-time visitor. Testing the header rather than req.auth, which does not
  // exist yet on this path and never will.
  if (!req.headers.authorization) {
    req.creator = GUEST_CREATOR;
    return next();
  }

  // `verify` is Express middleware, not a promise: it reports through a
  // callback and awaiting it would return immediately with nothing checked.
  return verify(req, res, (err) => {
    if (err) {
      // A token that is PRESENT but INVALID is an error, not a guest.
      //
      // Downgrading silently to guest would mean a user whose session expired
      // keeps browsing, quietly writing new courses into `guest-user` instead
      // of their own account, and seeing an empty library with nothing on
      // screen to explain where their courses went. It would hide our own token
      // bugs the same way. Nobody sends a broken token by accident: a visitor
      // sends none at all.
      return next(
        new ApiError(
          401,
          'invalid_token',
          `The access token was rejected (${err.code ?? err.message}). Sign in again.`
        )
      );
    }

    // `sub` — NOT email. Email is absent from an access token unless a custom
    // claim adds it, it changes when the user changes it, and it is not unique
    // across connections: the same person via Google and via a password is two
    // accounts sharing one address. `sub` is the only identifier Auth0
    // guarantees is stable and unique.
    //
    // This is the one place a token becomes an owner; nothing downstream reads
    // req.auth again.
    req.creator = req.auth?.payload?.sub ?? GUEST_CREATOR;

    return next();
  });
}

/**
 * Reject anyone who is not signed in. Must run after attachUser.
 *
 * @type {import('express').RequestHandler}
 */
export function requireUser(req, res, next) {
  // Not "is req.creator set" — attachUser always sets it. The question is
  // whether it is a real user or the shared guest.
  //
  // FAILS CLOSED when auth is unconfigured, and that is deliberate. The
  // alternative serves the guest library to anyone, and the guest library is
  // every visitor's throwaway courses pooled together — the one list this
  // product must never show. A private route that quietly stops being private
  // when an env var is missing is the classic way to ship an open endpoint, so
  // the missing env var breaks the page instead.
  if (!req.creator || req.creator === GUEST_CREATOR) {
    return next(
      new ApiError(
        401,
        'not_authenticated',
        'Sign in to see your courses.'
      )
    );
  }

  return next();
}

/**
 * The owner to use for this request's queries.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export function creatorOf(req) {
  // Not `req.creator` bare. A route that forgot attachUser would query
  // { creator: undefined }, and Mongoose reads that as "where this field is
  // missing" — a query that silently returns the wrong documents instead of
  // failing loudly.
  return req.creator ?? GUEST_CREATOR;
}
