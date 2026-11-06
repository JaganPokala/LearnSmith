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
  const hasAuthorization = Boolean(req.headers.authorization);

  // No login token: use the identity established by guest middleware.
  if (!hasAuthorization) {
    if (!req.guestId) {
      return next(
        new ApiError(
          409,
          'guest_session_required',
          'Your guest session is missing or expired. Refresh the page and try again.',
        ),
      );
    }

    req.creator = `guest:${req.guestId}`;
    req.identityType = 'guest';

    return next();
  }

  // A supplied token must never silently become a guest request.
  if (!verify) {
    return next(
      new ApiError(
        401,
        'auth_unavailable',
        'Token authentication is not configured.',
      ),
    );
  }

  return verify(req, res, (err) => {
    if (err) {
      return next(
        new ApiError(
          401,
          'invalid_token',
          'Your access token was rejected. Sign in again.',
        ),
      );
    }

    const subject = req.auth?.payload?.sub;

    if (typeof subject !== 'string' || !subject.trim()) {
      return next(
        new ApiError(
          401,
          'invalid_token',
          'The access token has no valid user identity.',
        ),
      );
    }

    req.creator = subject;
    req.identityType = 'user';

    return next();
  });
}

export function requireUser(req, res, next) {
  if (req.identityType !== 'user' || !req.creator) {
    return next(
      new ApiError(
        401,
        'not_authenticated',
        'Sign in to see your courses.',
      ),
    );
  }

  return next();
}

export function creatorOf(req) {
  if (typeof req.creator !== 'string' || !req.creator) {
    throw new Error('Request identity was not initialized.');
  }

  return req.creator;
}
