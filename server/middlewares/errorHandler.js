/**
 * server/middlewares/errorHandler.js
 *
 * One shape for every failure this API can produce:
 *
 *   { "error": { "code": "not_found", "message": "No route for GET /nope" } }
 *
 * Why it matters more than it looks: the React client will call
 * `response.json()` on failures too. Express's DEFAULT handler returns an HTML
 * page — so today a 404 makes the frontend throw a JSON parse error, and the
 * user sees a crash instead of "course not found". Every backend failure
 * becomes a confusing frontend bug.
 *
 * The default handler also prints a full stack trace including absolute file
 * paths, which publishes your directory layout to anyone who sends a bad
 * request.
 *
 * Exports three things:
 *   ApiError    - for routes to throw deliberately, with a status code
 *   notFound    - catches anything no route matched
 *   errorHandler- the last middleware in the chain
 */

import { config } from '../config/env.js';

/**
 * An error a route raises on purpose, carrying an HTTP status and a stable
 * machine-readable code.
 *
 * Why a class rather than `res.status(404).json(...)` inside each route:
 * throwing lets you exit from anywhere, including deep inside a service, without
 * that service needing to know what `res` is. Phase 3's generator will throw
 * these from files that have never heard of Express.
 *
 * `code` is for the client to branch on ('course_not_found'); `message` is for a
 * human to read. Keep them separate — message wording will change, code must not.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status, e.g. 404
   * @param {string} code        stable snake_case identifier, e.g. 'course_not_found'
   * @param {string} message     human-readable explanation
   */
  constructor(statusCode, code, message) {
    // 1. Call super(message) so Error's own machinery works.
    // 2. Store statusCode and code on the instance.
    // 3. Set this.name to 'ApiError'.
    // 4. Set this.isOperational = true.
    //    This flags "an error we anticipated and described" as opposed to a
    //    genuine bug (a TypeError from our own broken code). errorHandler uses
    //    it to decide whether the message is safe to show a stranger.

    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.name = 'ApiError';
    this.isOperational = true;
  }
}

/**
 * Runs when no route matched. Registered AFTER all routes, BEFORE errorHandler.
 *
 * Note it is a normal 3-argument middleware, not an error handler: nothing has
 * gone wrong yet, we have simply run out of routes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function notFound(req, res, next) {
  // 1. Build an ApiError: 404, code 'not_found', message naming the METHOD and
  //    the URL. Naming both matters — hitting POST on a GET-only route is a
  //    404 that looks identical to a typo'd path until the message says which.
  // 2. Pass it to next(). Calling next(err) with an argument skips every
  //    remaining normal middleware and jumps straight to the error handler.

  const err = new ApiError(404, 'not_found', `No route for ${req.method} ${req.originalUrl}`);

  next(err);
}

/**
 * Convert third-party error shapes into ApiError.
 *
 * Kept separate from errorHandler so the list of "libraries whose errors we
 * understand" is one readable block rather than branches inside the handler.
 *
 * @param {Error} err
 * @returns {Error} an ApiError if we recognised it, otherwise the original
 */
function translateKnownErrors(err) {
  // Mongoose: id in the URL is not a valid ObjectId.
  if (err.name === 'CastError') {
    return new ApiError(400, 'invalid_id', `"${err.value}" is not a valid id`);
  }

  // Mongoose: schema validation failed on save. err.errors is keyed by field,
  // so the message can name exactly which ones — far more useful than "invalid".
  if (err.name === 'ValidationError') {
    const fields = Object.keys(err.errors ?? {}).join(', ');
    return new ApiError(400, 'validation_failed', `Invalid or missing: ${fields}`);
  }

  return err;
}

/**
 * The last middleware in the chain. Converts anything thrown anywhere into the
 * single JSON shape above.
 *
 * MUST take exactly four parameters. Express identifies error handlers by
 * `fn.length === 4` — if you delete the unused `next` and Express silently treats this
 * as a normal middleware, it never runs on errors, and you get HTML pages back
 * with no clue why. Do not let a linter "helpfully" remove it.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, next) {
  // 1. If res.headersSent, the response already started streaming and you
  //    cannot change the status or body. Hand off to Express's built-in
  //    handler with next(err), which will close the connection. Trying to
  //    res.json() here throws a second error on top of the first.

  if (res.headersSent) return next(err);

  // 1b. Translate errors thrown by libraries that know nothing about our
  //     envelope. Mongoose is the one that matters here: both of these arrive
  //     with no statusCode, no status and no code, so without this they fall
  //     through to 500 — telling the client "our server crashed" when in fact
  //     they sent bad input.
  //
  //       CastError       — "/api/courses/not-an-id". A malformed id is the
  //                         client's typo. NOT a 404: "no such course" and
  //                         "that is not an id" are different answers.
  //       ValidationError — a required field missing on save.
  //
  //     Marked operational because their messages are safe to show and
  //     genuinely useful — they name the offending field.
  err = translateKnownErrors(err);

  // 2. Work out the status code. Three sources, in priority order:
  //      err.statusCode  - our ApiError
  //      err.status      - what body-parser and several other libraries use
  //      500             - anything else
  //    Both names exist in the wild; checking only one is why "why is my 400
  //    coming back as 500" happens. The malformed-JSON case sets err.status.

  const status = err.statusCode ?? err.status ?? 500;

  // 3. Work out the machine code:
  //      err.code if we set one,
  //      otherwise derive something sensible from the status
  //      (400 -> 'bad_request', 404 -> 'not_found', 500 -> 'internal_error').

  const CODE_FOR_STATUS = {
    400: 'bad_request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    413: 'payload_too_large',
    500: 'internal_error',
  };

  const code = err.code ?? CODE_FOR_STATUS[status] ?? 'error';

  // 4. Decide what MESSAGE is safe to send.
  //    - err.isOperational (our ApiError): the message was written for a user,
  //      send it as-is.
  //    - anything else is an unplanned crash. Its message may contain a file
  //      path, a query, or part of a connection string. In production send a
  //      generic line; in development send the real one, because you are the
  //      only one reading it.

  const safeToShow = err.isOperational === true || !config.isProduction;
  const message = safeToShow ? err.message : 'Something went wrong on our end.';

  // 5. LOG the real error server-side, always, including the stack — separate
  //    from what you send. The whole point of step 4 is that the client sees
  //    less than you do; if you also log less, the information is simply gone.
  //    Include req.method and req.originalUrl so a 500 in a log is traceable to
  //    a request.

  console.error(`\n[error] ${req.method} ${req.originalUrl} -> ${status} ${code}`);
  console.error(err.stack ?? err);

  // 6. Send res.status(status).json({ error: { code, message } }).
  //    In development only, also attach err.stack — it makes curl debugging far
  //    faster, and config.isProduction is what keeps it out of the deploy.

  const body = { error: { code, message } };

  if (!config.isProduction) {
    body.error.stack = err.stack;
  }

  res.status(status).json(body);
}
