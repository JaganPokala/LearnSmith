/**
 * One shape for every failure: { error: { code, message } }.
 *
 * Express's default handler returns an HTML page, so without this a 404 makes
 * the React client throw a JSON parse error instead of showing a message.
 */

import { config } from '../config/env.js';
import { traceError } from './trace.js';

/**
 * An error a route raises on purpose. Throwing lets a service exit from
 * anywhere without knowing what `res` is.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status, e.g. 404
   * @param {string} code        stable snake_case identifier, e.g. 'course_not_found'
   * @param {string} message     human-readable explanation
   */
  constructor(statusCode, code, message) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.name = 'ApiError';

    // "Anticipated and described", as opposed to a genuine bug. errorHandler
    // uses it to decide whether the message is safe to show a stranger.
    this.isOperational = true;
  }
}

/**
 * Runs when no route matched. Registered after all routes, before errorHandler.
 * A normal 3-arg middleware — nothing has gone wrong, we ran out of routes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function notFound(req, res, next) {
  // Naming the METHOD as well as the URL: POST to a GET-only route is a 404
  // that looks identical to a typo'd path until the message says which.
  const err = new ApiError(404, 'not_found', `No route for ${req.method} ${req.originalUrl}`);

  next(err);
}

/**
 * Convert third-party error shapes into ApiError. Separate from errorHandler so
 * the list of recognised libraries is one readable block.
 *
 * @param {Error} err
 * @returns {Error} an ApiError if recognised, otherwise the original
 */
function translateKnownErrors(err) {
  // Mongoose: the id in the URL is not a valid ObjectId. 400, not 404 — "no
  // such course" and "that is not an id" are different answers.
  if (err.name === 'CastError') {
    return new ApiError(400, 'invalid_id', `"${err.value}" is not a valid id`);
  }

  // Database unreachable. These arrive with no statusCode and no code, so
  // without this they fall through to 500 — blaming our code for a dependency.
  //
  // The name is unintuitive: the one you actually hit is a plain MongooseError
  // from command buffering, "Operation `courses.insertOne()` buffering timed
  // out after 10000ms". Nothing in it says "disconnected".
  if (
    err.name === 'MongooseError' ||
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError' ||
    /buffering timed out/i.test(err.message ?? '')
  ) {
    return new ApiError(
      503,
      'database_unavailable',
      'The database is unavailable right now. Nothing was saved - try again in a moment.'
    );
  }

  // err.errors is keyed by field, so the message can name exactly which ones.
  if (err.name === 'ValidationError') {
    const fields = Object.keys(err.errors ?? {}).join(', ');
    return new ApiError(400, 'validation_failed', `Invalid or missing: ${fields}`);
  }

  return err;
}

/**
 * The last middleware in the chain.
 *
 * MUST take exactly four parameters — Express identifies error handlers by
 * fn.length === 4. Delete the unused `next` and this silently becomes a normal
 * middleware that never runs on errors. Do not let a linter remove it.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, next) {
  // The response already started streaming; res.json() here throws a second
  // error on top of the first.
  if (res.headersSent) return next(err);

  err = translateKnownErrors(err);

  // Both names exist in the wild — body-parser sets err.status, and checking
  // only one is why "my 400 comes back as 500" happens.
  const status = err.statusCode ?? err.status ?? 500;

  const CODE_FOR_STATUS = {
    400: 'bad_request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    413: 'payload_too_large',
    500: 'internal_error',
  };

  const code = err.code ?? CODE_FOR_STATUS[status] ?? 'error';

  // An unplanned crash's message may contain a file path or part of a
  // connection string. In development you are the only one reading it.
  const safeToShow = err.isOperational === true || !config.isProduction;
  const message = safeToShow ? err.message : 'Something went wrong on our end.';

  // No leading newline — trace() prefixes the request id, and a newline pushes
  // the text onto a line where nothing identifies which request it belongs to.
  traceError(`error: ${status} ${code} - ${err.message}`);

  // The stack only when it tells you something: ten frames of Express router
  // internals under every deliberate 400 buries the lines that matter.
  if (!err.isOperational) {
    traceError(err.stack ?? err);
  }

  const body = { error: { code, message } };

  if (!config.isProduction) {
    body.error.stack = err.stack;
  }

  res.status(status).json(body);
}
