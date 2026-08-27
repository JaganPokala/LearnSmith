/**
 * server/routes/health.js
 *
 * "Is this process alive, and what is working?"
 *
 * The most useful route in the project, because it is the only one that still
 * tells you something when everything else is broken. Three jobs:
 *
 *   1. Render polls it to decide whether a deploy succeeded (Phase 6).
 *   2. It separates "server down" from "wrong URL" from "CORS" from "cold
 *      start" in about two seconds, instead of by guesswork.
 *   3. `uptime` proves WHICH process answered — the giveaway when you are
 *      unknowingly talking to a stale server still holding the port.
 *
 * Rules for this file:
 *   - No database query, no OpenAI call, nothing slow. A health check that
 *     depends on something slow can time out and report "unhealthy" when the
 *     only unhealthy thing is the health check.
 *   - Nothing secret in the response. This route is public and unauthenticated.
 */

import { Router } from 'express';
import { config, features } from '../config/env.js';

const router = Router();

/**
 * Describe the database connection in words, not booleans.
 *
 * Why a function and not an inline ternary: Task 2.1 replaces the body of this
 * with mongoose's real connection state, and having one named place to change
 * is the difference between a two-line edit and a hunt.
 *
 * Why three states rather than up/down: "no MONGO_URI configured" and
 * "configured but unreachable" look identical in a boolean and have completely
 * different fixes — one is a missing env var, the other is Atlas or the network.
 * Collapsing them now means re-deriving the distinction later, in production,
 * under time pressure.
 *
 * @returns {'not configured' | 'down' | 'up'}
 */
function describeDatabase() {
  // Derived from `features`, never a second read of process.env - env.js owns
  // that, and a second read is a second thing that can drift.
  if (!features.database) return 'not configured';

  // Configured, but mongoose is not wired until Phase 2. "We have not connected
  // yet" is the honest answer; Task 2.1 replaces this with the real state.
  return 'down';
}

/**
 * GET /api/health
 *
 * Mounted in server.js with app.use('/api/health', healthRouter), so the path
 * here is '/' — the mount path and the route path concatenate. Writing
 * '/health' here would produce /api/health/health.
 */
router.get('/', (req, res) => {
  // 200 even when db is 'down'. This route answers "is this process alive";
  // whether Atlas is reachable is information in the body, not a verdict on the
  // process. A 503 here would have Render restart a healthy server, which does
  // not fix Atlas and adds a restart loop on top.
  res.json({
    ok: true,

    // Rounded: the question is "is this the process I just started", not
    // nanoseconds.
    uptime: Math.round(process.uptime()),

    env: config.NODE_ENV,
    db: describeDatabase(),

    // `features` only - no describeConfig(). This route is public, and model
    // ids and origins do not need publishing to anyone who curls it.
    features,
  });
});

export default router;
