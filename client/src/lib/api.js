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

async function request(path, options = {}) {
  let res;

  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    // fetch only rejects when the request could not happen at all:
    // server down, DNS, CORS. There is no status and no body here.
    throw new ApiError('Cannot reach the server. Is the backend running?', {
      code: 'network_error',
      status: 0,
    });
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
  post: (path, body) =>
    request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),

  delete: (path) => request(path, { method: 'DELETE' }),
};
