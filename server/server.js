/**
 * server/server.js — application entry point.
 *
 * Deliberately thin: middleware, mount points, listen. Nothing else.
 * Routes live in routes/, business logic in services/. If this file grows past
 * roughly 80 lines, something is in the wrong folder.
 *
 * MIDDLEWARE ORDER IS THE WHOLE MENTAL MODEL HERE. Express runs these top to
 * bottom in registration order:
 *
 *   request -> cors -> express.json -> morgan -> routes -> 404 -> error handler
 *
 * Register express.json AFTER your routes and req.body is undefined inside
 * them, silently. Register cors after routes and the browser discards a response
 * your handler worked to produce.
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

// Imported FIRST on purpose. env.js validates at module load and may call
// process.exit(1) — a misconfigured server should never reach the point of
// binding a port.
import { config, features, describeConfig } from './config/env.js';

import healthRouter from './routes/health.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';
import { connectDB, disconnectDB } from './config/db.js';

const app = express();

// ---------------------------------------------------------------------------
// 1. Trust the proxy (production only).
// ---------------------------------------------------------------------------
// Render terminates TLS upstream and forwards plain HTTP to this process, so
// req.protocol reads "http" even on an https:// URL and req.ip is the proxy's
// address. Setting 'trust proxy' makes Express read X-Forwarded-* instead.
//
// Guard it behind config.isProduction: trusting forwarded headers from an
// arbitrary local client is not something you want in development.

if (config.isProduction) {
  app.set('trust proxy', 1);
}


// ---------------------------------------------------------------------------
// 2. CORS.
// ---------------------------------------------------------------------------
// The browser blocks cross-origin calls unless the server opts in. Your React
// dev server runs on a different port, so without this every request from the
// frontend fails.
//
// Use config.CLIENT_ORIGIN — not '*'. A wildcard lets any site on the internet
// call this API from a visitor's browser. It also stops working the moment you
// set credentials: true, because browsers reject wildcard + credentials.

// One exact origin, so a response to any other site's page is never approved.
// Auth0 will send its token in an Authorization header, which cors already
// allows by reflecting the browser's preflight request - no cookies involved,
// so credentials stays off until something actually needs it.
app.use(
  cors({
    origin: config.CLIENT_ORIGIN,
  })
);

// ---------------------------------------------------------------------------
// 3. JSON body parsing.
// ---------------------------------------------------------------------------
// Populates req.body for requests with Content-Type: application/json.
// Pass an explicit limit. Course prompts are tiny; the cap is there so a junk
// POST cannot make the server allocate whatever the sender feels like.

// 10kb is far more than a course prompt needs and far less than a payload worth
// buffering. Without a limit the default is 100kb, which is still a number
// someone else picked for a different app.

app.use(express.json({ limit: '10kb' }));//?what about the generated response 
//it may be more than 10kb right?? what to do in that case 

// ---------------------------------------------------------------------------
// 4. Request logging.
// ---------------------------------------------------------------------------
// morgan takes a format name. 'dev' is short and colourised for a terminal;
// 'combined' is the Apache-style line that log aggregators expect.
// Pick based on config.isProduction.

app.use(morgan(config.isProduction ? 'combined' : 'dev'));

// ---------------------------------------------------------------------------
// 5. Routes.
// ---------------------------------------------------------------------------
// Just one stub for now so there is something to verify against — a server that
// listens but answers nothing is not verified. Health moves to routes/health.js
// in Task 1.2, and the JSON 404 + error handler arrive in Task 1.3.
//
// Return something that identifies the service and points at the health route.

// Hitting the root of a deployed API and getting *something* named back is the
// fastest way to tell "wrong URL" apart from "server is down".
app.get('/', (req, res) => {
  res.json({
    service: 'text-to-learn-api',
    status: 'ok',
    health: '/api/health',
  });
});

// Mounted here, so the path inside routes/health.js is '/' — the mount path and
// the route path concatenate. '/health' in there would give /api/health/health.
app.use('/api/health', healthRouter);

// notFound runs after every real route, or it would swallow them.
// errorHandler is registered LAST: it only catches errors from middleware above it.
app.use(notFound);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// 6. Start listening.
// ---------------------------------------------------------------------------
// Bind to config.PORT. On Render the platform sets PORT in the environment and
// expects you to use exactly that — the 5000 in SPEC is only a local fallback.
//
// Keep the return value of app.listen(). You need the http.Server object in
// step 7; there is no way to get it back afterwards.
//
// In the callback, log something useful for the first ten seconds of every
// deploy: the URL, NODE_ENV, whether a .env file was used, and the features
// map. In development also dump describeConfig() — seeing the resolved config
// next to the feature flags is what makes a wrong value obvious rather than
// puzzling.

// Deliberately NOT awaited. Awaiting would block boot for up to
// serverSelectionTimeoutMS, and on Render a slow boot can miss the health-check
// window and fail the deploy. Not awaiting also makes the 'connecting' state in
// getDatabaseState() observable instead of theoretical: /api/health can be hit
// while the handshake is still in flight. connectDB never throws, so a floating
// promise here cannot produce an unhandled rejection.
connectDB();

const server = app.listen(config.PORT, () => {
  console.log(`\n  text-to-learn-api listening on http://localhost:${config.PORT}`);
  console.log(`  NODE_ENV  : ${config.NODE_ENV}`);
  console.log(
    `  .env file : ${config.envFileLoaded ? config.envFilePath : 'none - using the platform environment'}`
  );
  console.log('  features  :', features);

  // Only in development: the resolved values next to the flags they produced is
  // what turns "auth is off?" into "AUTH0_AUDIENCE is empty". describeConfig()
  // redacts secrets, but there is no reason to print it into a deploy log.
  if (!config.isProduction) {
    console.log('  config    :', describeConfig());
  }

  console.log('');
});

// ---------------------------------------------------------------------------
// 7. Graceful shutdown.
// ---------------------------------------------------------------------------
// Render sends SIGTERM on every redeploy. With no handler Node dies instantly
// and any in-flight request is dropped — including a 15-second AI generation,
// which the user sees as a 502 and blames on your app.
//
// For both SIGTERM and SIGINT (Ctrl+C):
//   1. Log which signal arrived, so an unexplained restart is explicable later.
//   2. server.close(...) — stops accepting NEW connections and waits for the
//      in-flight ones to finish. It does not kill anything.
//   3. process.exit(0) inside the close callback.
//
// Handle both signals with one loop rather than two near-identical blocks.

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\n${signal} received - no new connections, finishing in-flight requests.`);

    // close() is not a kill: it stops the listener and lets open requests run
    // to completion, then fires this callback.
    server.close(async () => {
      // After close(), so in-flight requests still have their database.
      await disconnectDB();
      console.log('Closed cleanly.');
      process.exit(0);
    });
  });
}

// Exported so a future test can import the app without starting a listener.
export default app;
