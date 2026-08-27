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
import { getDatabaseState } from '../config/db.js';

const router = Router();

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
    // db.js owns connection state; asking it keeps this route from
    // importing mongoose or duplicating the readyState mapping.
    db: getDatabaseState(),

    // `features` only - no describeConfig(). This route is public, and model
    // ids and origins do not need publishing to anyone who curls it.
    features,
  });
});

export default router;
