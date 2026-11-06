/**
 * The only place this app talks to the backend.
 *
 * Turns every failure into a thrown Error carrying `code` and `status`, so
 * screens can branch on the code instead of parsing the envelope themselves.
 */


import { generationSettled } from './generationEvents.js';

/** An API failure, carrying the backend's machine-readable code. */
export class ApiError extends Error {
  constructor(message, { code, status }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Default deadline for a read. Measured reads are 70-250ms, so 20s is not about
 * them — it is about Render's free instance waking up, which the warmup ping in
 * main.jsx only helps with if it lands first.
 */
const READ_TIMEOUT_MS = 20_000;

/**
 * Deadline for a generation. The server's own worst case is MAX_ATTEMPTS (2) x
 * the OpenAI timeout (30s) plus database work, so this has to sit ABOVE that:
 * a client that gives up first cancels work that was about to succeed, and you
 * pay for the tokens either way.
 */
const GENERATE_TIMEOUT_MS = 75_000;
// One translation (30s) plus at most four sequential speech chunks (90s each),
// with margin for database work. A proxy may impose a shorter deadline.
const AUDIO_TIMEOUT_MS = 420_000;

/**
 * How to get the current access token, or null when nobody is signed in.
 *
 * A module-level slot rather than an argument threaded through every call:
 * the token comes from a React hook, and this file is not a component. The
 * bridge in lib/auth.jsx fills it in and clears it on sign-out.
 */
let tokenSource = null;

/** @param {null | (() => Promise<string|null>)} fn */
export function setTokenSource(fn) {
  tokenSource = fn;
}

let guestSessionPromise = null;

function initializeGuestSession() {
  const sendSessionRequest = () =>
    request('/api/session', {
      method: 'POST',
      skipGuestInit: true,
    });

  if (navigator.locks?.request) {
    return navigator.locks.request(
      'learnsmith-guest-session',
      sendSessionRequest,
    );
  }

  // Older browsers retain coordination within this page only.
  return sendSessionRequest();
}

function ensureGuestSession() {
  if (!guestSessionPromise) {
    guestSessionPromise = initializeGuestSession().catch((err) => {
      guestSessionPromise = null;
      throw err;
    });
  }

  return guestSessionPromise;
}

async function request(
  path,
  {
    timeoutMs = READ_TIMEOUT_MS,
    parse = 'json',
    skipGuestInit = false,
    ...options
  } = {},
) {
  if (!skipGuestInit) {
    await ensureGuestSession();
  }

  let res;
  const token = tokenSource ? await tokenSource() : null;

  const headers = token
    ? { ...options.headers, Authorization: `Bearer ${token}` }
    : options.headers;

  // fetch has NO default timeout. Not 30s, not 60s — a server that accepts the
  // connection and then goes silent leaves this pending until the OS gives up,
  // which is minutes of a spinner with no failure state.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    res = await fetch(path, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    // TWO reasons fetch rejects now, and they need opposite advice. Before the
    // abort existed there was only one, so collapsing them was fine; now
    // reporting "cannot reach the server" on a timeout is simply false — the
    // server is up, it is slow, and it may still be working.
    if (err.name === 'AbortError') {
      throw new ApiError(
        `The server did not answer within ${Math.round(timeoutMs / 1000)} seconds.`,
        { code: 'timeout', status: 0 },
      );
    }

    // A genuine failure to connect: server down, DNS, CORS. No status, no body.
    throw new ApiError('Cannot reach the server. Is the backend running?', {
      code: 'network_error',
      status: 0,
    });
  } finally {
    // In `finally` so it runs on the failure path too. Without it every request
    // leaves a live timer holding its controller until the deadline passes.
    clearTimeout(timer);
  }

  // A 404 or 500 is a SUCCESSFUL fetch as far as the browser is concerned.
  // Nothing throws unless we do it ourselves.
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      // Server sent HTML or nothing — common when a proxy or crash intercepts.
    }

    throw new ApiError(
      body?.error?.message ?? `Request failed (${res.status} ${res.statusText})`,
      { code: body?.error?.code ?? 'unknown_error', status: res.status },
    );
  }

  // Binary responses (lesson narration) come back as a Blob. The alternative —
  // pointing an <audio src> at the URL — cannot work: the browser fetches that
  // natively, outside this file, so it carries no Authorization header and an
  // owned lesson answers 404. Same shape as the F5 reload bug.
  return parse === 'blob' ? res.blob() : res.json();
}

async function generationRequest(path, options) {
  try {
    return await request(path, options);
  } finally {
    // Includes quota/provider failures and timeouts. Only the server knows
    // whether an allowance was consumed. Usage reads/session setup do not emit.
    generationSettled();
  }
}

export const api = {
  get: (path) => request(path),

  // Content-Type only where there is a body; on GET/DELETE it just triggers
  // an unnecessary CORS preflight.
  //
  // Generation POSTs get a longer deadline and refresh the allowance display.
  // One global number cannot serve both: 20s would kill a legitimate lesson,
  // and 75s would leave a hung read spinning for over a minute.
  post: (path, body) =>
    generationRequest(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      timeoutMs: GENERATE_TIMEOUT_MS,
    }),

  // Saving learning activity is ordinary database work, with no AI allowance.
  postAction: (path, body) => request(path, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
  put: (path, body) => request(path, { method: 'PUT',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),

  delete: (path) => request(path, { method: 'DELETE' }),

  /** Read binary. Returns a Blob; 404s throw like any other request. */
  getBlob: (path) => request(path, { parse: 'blob' }),

  /** Generate binary, allowing bounded multi-chunk narration to finish. */
  postBlob: (path) =>
    generationRequest(path, { method: 'POST', parse: 'blob', timeoutMs: AUDIO_TIMEOUT_MS }),
};
