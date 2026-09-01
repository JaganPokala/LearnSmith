/**
 * The only place this app talks to the backend.
 *
 * Turns every failure into a thrown Error carrying `code` and `status`, so
 * screens can branch on the code instead of parsing the envelope themselves.
 */

const BASE = import.meta.env.VITE_API_URL;

if (!BASE) {
  // Better a loud message now than "undefined/api/courses" 404s later.
  console.error('VITE_API_URL is not set. Add it to client/.env and restart the dev server.');
}

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

async function request(path, { timeoutMs = READ_TIMEOUT_MS, ...options } = {}) {
  let res;

  // AWAIT. `tokenSource()` returns a promise, and a forgotten await sends the
  // literal string "Bearer [object Promise]" — a 401 that reads like a broken
  // Auth0 configuration and sends you to the dashboard instead of to this line.
  //
  // No header at all when there is no token, rather than an empty one: the
  // guest routes must look exactly like they did before auth existed.
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
    res = await fetch(`${BASE}${path}`, { ...options, headers, signal: controller.signal });
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

  return res.json();
}

export const api = {
  get: (path) => request(path),

  // Content-Type only where there is a body; on GET/DELETE it just triggers
  // an unnecessary CORS preflight.
  //
  // Every POST in this app is a generation, so they all get the long deadline.
  // One global number cannot serve both: 20s would kill a legitimate lesson,
  // and 75s would leave a hung read spinning for over a minute.
  post: (path, body) =>
    request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      timeoutMs: GENERATE_TIMEOUT_MS,
    }),

  delete: (path) => request(path, { method: 'DELETE' }),
};
