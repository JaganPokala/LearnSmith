/**
 * Refuses a request early when the database is unreachable, so nothing
 * expensive happens on a request that could never be saved.
 *
 * Measured with Atlas down: POST /api/courses/generate took 15.7s and returned
 * 500 (5.0s OpenAI + 10.0s mongoose buffering). With this: 503 in ~0ms, no API
 * call. On the router rather than in four controllers, so it cannot drift.
 */

import { getDatabaseState } from '../config/db.js';
import { ApiError } from './errorHandler.js';

/**
 * Express middleware. Attach to any route that touches the database.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireDatabase(req, res, next) {
  const state = getDatabaseState();

  // 'connecting' PASSES ON PURPOSE. connectDB() is not awaited, so for ~500ms
  // after boot the server listens while the handshake is in flight — and
  // mongoose buffers operations, so those requests complete normally.
  // Buffering is only pathological when the connection is never coming.
  if (state === 'up' || state === 'connecting') return next();

  // Different causes, different fixes, so different messages.
  const message =
    state === 'not configured'
      ? 'This server has no database configured, so courses cannot be saved or listed.'
      : 'The database is unavailable right now. Nothing was saved - try again in a moment.';

  // 503, not 500: our code is fine, a dependency is not.
  next(new ApiError(503, 'database_unavailable', message));
}
