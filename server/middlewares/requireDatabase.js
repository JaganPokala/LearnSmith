/**
 * server/middlewares/requireDatabase.js
 *
 * Refuses a request early when the database is unreachable, so nothing
 * expensive happens on a request that cannot possibly be saved.
 *
 * WHAT THIS FIXES, measured:
 *   With Atlas unreachable, POST /api/courses/generate took 15.7s to fail:
 *     ~5.0s  OpenAI generated a course (real money, nowhere to put it)
 *     10.0s  mongoose buffered the insert, waiting for a connection
 *      0.7s  everything else
 *   ...and returned 500, blaming our own code for a dependency being down.
 *
 *   With this middleware the same request fails in ~0ms with 503 and makes no
 *   API call at all.
 *
 * WHY MIDDLEWARE RATHER THAN A LINE IN THE CONTROLLER:
 * four routes need it (generate, list, get one, generate lesson). A check
 * copied into four controllers drifts; one applied to a router does not.
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

  // 'connecting' PASSES ON PURPOSE — and this is the interesting decision.
  //
  // D8 established that connectDB() is not awaited, so for roughly 250ms after
  // boot the server is listening while the handshake is still in flight. During
  // that window mongoose BUFFERS operations: a request arriving at t+100ms is
  // queued and completes normally at t+500ms.
  //
  // Rejecting 'connecting' would break that working case in order to improve a
  // broken one. Buffering is the right behaviour for a connection that is
  // coming; it is only pathological when the connection is never coming, and
  // that is exactly the case below.
  if (state === 'up' || state === 'connecting') return next();

  // 'down'            - configured but unreachable (Atlas, network, credentials)
  // 'not configured'  - no MONGO_URI at all
  //
  // Different causes, different fixes, so they get different messages. The
  // three-state distinction from Task 2.1 pays for itself here.
  const message =
    state === 'not configured'
      ? 'This server has no database configured, so courses cannot be saved or listed.'
      : 'The database is unavailable right now. Nothing was saved - try again in a moment.';

  // 503, not 500: our code is fine, a dependency is not. Same reasoning as the
  // 502 used for OpenAI failures (D13).
  next(new ApiError(503, 'database_unavailable', message));
}
