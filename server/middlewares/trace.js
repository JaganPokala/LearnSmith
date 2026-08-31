/**
 * Gives every request a short id and stamps every log line it produces with it,
 * so one request reads as a block even when three are interleaved.
 *
 * AsyncLocalStorage rather than a `reqId` argument because openai.js is four
 * calls deep and never sees `req` — this lets any function in the chain read
 * the id without it being in every signature.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

const store = new AsyncLocalStorage();

/**
 * Express middleware. Install it before anything that logs.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requestTrace(req, res, next) {
  // Only has to be unique among the requests alive at the same moment.
  const id = randomBytes(2).toString('hex');
  const startedAt = performance.now();

  req.id = id;

  console.log(`[${id}] --> ${req.method} ${req.originalUrl}`);

  // 'close' is the one people forget: if the client gives up first the response
  // never finishes, 'finish' never fires, and the request has no closing line —
  // which reads as "the server hung" when the caller simply left.
  let done = false;

  res.on('finish', () => {
    done = true;
    console.log(`[${id}] <-- ${res.statusCode} in ${Math.round(performance.now() - startedAt)}ms`);
  });

  res.on('close', () => {
    if (done) return;
    console.log(
      `[${id}] <-- client disconnected after ${Math.round(performance.now() - startedAt)}ms`
    );
  });

  // next() INSIDE store.run is the whole mechanism — called outside, the rest of
  // the request runs without the context and every trace() below finds nothing.
  store.run({ id, startedAt }, next);
}

/**
 * Drop-in for console.log, plus the request id and elapsed time. That elapsed
 * number is what turns a log into a profile. Safe to call outside a request.
 *
 * @param {...unknown} args
 */
export function trace(...args) {
  const ctx = store.getStore();

  if (!ctx) {
    console.log(' ', ...args);
    return;
  }

  const ms = `+${Math.round(performance.now() - ctx.startedAt)}ms`;

  console.log(`[${ctx.id}] ${ms.padStart(9)}`, ...args);
}

/** Same, on stderr — a different stream in every log viewer including Render's. */
export function traceError(...args) {
  const ctx = store.getStore();

  if (!ctx) {
    console.error(' ', ...args);
    return;
  }

  const ms = `+${Math.round(performance.now() - ctx.startedAt)}ms`;

  console.error(`[${ctx.id}] ${ms.padStart(9)}`, ...args);
}

/** The current request's id, or null outside a request. */
export function currentRequestId() {
  return store.getStore()?.id ?? null;
}
