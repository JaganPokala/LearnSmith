import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';

const COOKIE_NAME = 'learnsmith_guest';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Job 1: Read the verified cookie. Never create one here.
export function attachGuest(req, res, next) {
  res.set('Cache-Control', 'private, no-store');

  const existingId = req.signedCookies?.[COOKIE_NAME];

  req.guestId =
    typeof existingId === 'string' && UUID_PATTERN.test(existingId)
      ? existingId
      : null;

  next();
}

// Job 2: Create a cookie when the session endpoint requests it.
export function initializeGuestSession(req, res) {
  if (!req.guestId) {
    const guestId = randomUUID();

    res.cookie(COOKIE_NAME, guestId, {
      signed: true,
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/api',
      maxAge: THIRTY_DAYS_MS,
    });

    req.guestId = guestId;
  }

  res.json({ ready: true });
}