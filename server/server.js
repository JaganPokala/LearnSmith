/**
 * Application entry point: middleware, mount points, listen.
 *
 * Middleware order is the mental model — Express runs these in registration
 * order: cors -> express.json -> trace -> routes -> 404 -> error handler.
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { config, features, describeConfig } from './config/env.js';

import healthRouter from './routes/health.js';
import coursesRouter from './routes/courses.js';
import lessonsRouter from './routes/lessons.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';
import { requestTrace } from './middlewares/trace.js';
import { connectDB, disconnectDB } from './config/db.js';

const app = express();

// Render terminates TLS upstream, so req.protocol and req.ip read the proxy's
// values without this. Guarded: trusting forwarded headers locally is not safe.
if (config.isProduction) {
  app.set('trust proxy', 1);
}

// One exact origin, never '*' — a wildcard lets any site call this API from a
// visitor's browser, and browsers reject wildcard + credentials anyway.
app.use(
  cors({
    origin: config.CLIENT_ORIGIN,
  })
);

// Caps the incoming REQUEST body only; responses are unaffected. A course
// prompt is ~40 bytes, so 10kb is generous and stops a junk POST allocating
// whatever the sender feels like.
app.use(express.json({ limit: '10kb' }));

// Before the routes, so every line any layer logs during a request is already
// inside its AsyncLocalStorage context.
app.use(requestTrace);

// Redundant in development — requestTrace's "<--" line carries everything
// morgan 'dev' printed, plus a request id. 'combined' stays for production
// because that is the format log aggregators parse.
if (config.isProduction) {
  app.use(morgan('combined'));
}

// Hitting the root of a deployed API and getting something named back is the
// fastest way to tell "wrong URL" apart from "server is down".
app.get('/', (req, res) => {
  res.json({
    service: 'text-to-learn-api',
    status: 'ok',
    health: '/api/health',
  });
});

// Mount path and route path concatenate: '/' inside health.js becomes
// /api/health.
app.use('/api/health', healthRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/lessons', lessonsRouter);

// notFound after every real route or it swallows them; errorHandler last,
// because it only catches errors from middleware above it.
app.use(notFound);
app.use(errorHandler);

// NOT awaited. Awaiting blocks boot for up to serverSelectionTimeoutMS, and on
// Render a slow boot can miss the health-check window and fail the deploy.
// connectDB never throws, so a floating promise here is safe.
connectDB();

const server = app.listen(config.PORT, () => {
  console.log(`\n  text-to-learn-api listening on http://localhost:${config.PORT}`);
  console.log(`  NODE_ENV  : ${config.NODE_ENV}`);
  console.log(
    `  .env file : ${config.envFileLoaded ? config.envFilePath : 'none - using the platform environment'}`
  );
  console.log('  features  :', features);

  // Development only: the resolved values next to the flags they produced turns
  // "auth is off?" into "AUTH0_AUDIENCE is empty". Not for a deploy log.
  if (!config.isProduction) {
    console.log('  config    :', describeConfig());
  }

  console.log('');
});

// Render sends SIGTERM on every redeploy. Without this, Node dies instantly and
// drops in-flight requests — including a 13-second generation, which the user
// sees as a 502. close() stops new connections and lets open ones finish.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\n${signal} received - no new connections, finishing in-flight requests...`);

    server.close(async () => {
      // After close(), so in-flight requests still have their database.
      await disconnectDB();
      console.log('Closed cleanly.');
      process.exit(0);
    });
  });
}

// NOTE: importing this file still runs connectDB() and app.listen() above, so a
// test cannot yet use this export without starting a server. Moving those two
// behind a guard is what would make it useful.
export default app;
