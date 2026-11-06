import { rateLimit } from 'express-rate-limit';
import { BURST_LIMITS } from '../config/burstLimits.js';

export function createBurstLimiters({
  windowMs = BURST_LIMITS.windowMs,
  sessionsPerIp = BURST_LIMITS.sessionsPerIp,
  generationRequestsPerIdentity = BURST_LIMITS.generationRequestsPerIdentity,
} = {}) {
  const options = (identifier, label) => ({
    windowMs,
    identifier,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res) {
      const reset = req.rateLimit?.resetTime?.getTime();
      const retryAfterSeconds = Number.isFinite(reset)
        ? Math.max(1, Math.ceil((reset - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);

      res.set('Retry-After', String(retryAfterSeconds));
      res.set('Cache-Control', 'private, no-store');
      res.status(429).json({
        error: {
          code: 'burst_limit_exceeded',
          message: `Too many ${label}. Try again in ${retryAfterSeconds} seconds.`,
          retryAfterSeconds,
        },
      });
    },
  });

  // Use the library's default IP key, including its IPv6 subnet handling.
  // Express trust-proxy configuration determines which address is observed.
  const sessionLimiter = rateLimit({
    ...options('guest-session', 'session requests'),
    limit: sessionsPerIp,
  });

  // One shared bucket across course, lesson-body, and narration POSTs.
  // Identity was established by our middleware, never read from request input.
  const generationLimiter = rateLimit({
    ...options('generation', 'generation requests'),
    limit: generationRequestsPerIdentity,
    keyGenerator(req) {
      if (typeof req.creator !== 'string' || !req.creator) {
        throw new Error('Identity middleware must run before generation rate limiting.');
      }
      return req.creator;
    },
  });

  return { sessionLimiter, generationLimiter };
}

// Import these same instances wherever the routes use them. Separate instances
// would create independent counters and let requests evade a combined limit.
export const { sessionLimiter, generationLimiter } = createBurstLimiters();
