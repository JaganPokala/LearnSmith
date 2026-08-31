/**
 * Mounted at /api/health. No database query, no OpenAI call, nothing secret —
 * a health check that depends on something slow can time out and lie.
 */

import { Router } from 'express';
import { config, features } from '../config/env.js';
import { getDatabaseState } from '../config/db.js';

const router = Router();

router.get('/', (req, res) => {
  // 200 even when db is 'down'. This answers "is this process alive"; a 503
  // would have Render restart a healthy server, which does not fix Atlas.
  res.json({
    ok: true,

    // Proves WHICH process answered — the giveaway for a stale server still
    // holding the port.
    uptime: Math.round(process.uptime()),

    env: config.NODE_ENV,
    db: getDatabaseState(),

    // features only, never describeConfig() — this route is public.
    features,
  });
});

export default router;
