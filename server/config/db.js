/**
 * server/config/db.js
 *
 * Owns the MongoDB connection. Nothing else in the server imports mongoose to
 * ask about connection state — they ask this file.
 *
 * THE RULE FOR THIS FILE: never process.exit on a connection failure.
 * Task 1.2 promised that /api/health answers with db: "down" when Mongo is
 * unreachable. A server that dies on a transient Atlas blip cannot keep that
 * promise, and on Render a crash-loop is far harder to diagnose than a running
 * server that tells you exactly what is wrong. Losing the database is a
 * DEGRADED mode, not a fatal one — course generation (Phase 3) does not need
 * Mongo at all, only saving does.
 */

import mongoose from 'mongoose';
import { config, features } from './env.js';

/**
 * mongoose.connection.readyState is a number. These are its meanings.
 *
 * Written as a lookup rather than a chain of ifs because 2 is the one everyone
 * forgets: during startup and during an automatic reconnect the connection is
 * neither up nor down, and reporting "down" then makes a perfectly healthy
 * boot look like an outage.
 */
const READY_STATE = {
  0: 'down', // disconnected
  1: 'up', // connected
  2: 'connecting', // handshake in progress, or reconnecting after a drop
  3: 'down', // disconnecting
};

/**
 * Attach listeners for the whole life of the process.
 *
 * Why this is not optional: Atlas WILL drop and re-establish connections while
 * the server is running — maintenance windows, network blips, idle timeouts.
 * mongoose reconnects on its own, but silently. Without these listeners the
 * first sign of trouble is a request failing for no visible reason.
 *
 * Call this ONCE, before connecting. Calling it twice registers duplicate
 * listeners and every event logs twice, which reads like the event fired twice.
 */
let eventsRegistered = false;

function registerConnectionEvents() {
  // Guard rather than trusting the caller. Duplicate listeners make every event
  // log twice, which reads exactly like the event firing twice.
  if (eventsRegistered) return;
  eventsRegistered = true;

  const conn = mongoose.connection;

  // Logging the DATABASE name, not just the host, is what catches a typo in the
  // MONGO_URI path. Mongo creates whatever name you ask for without complaint,
  // so `text-to-lern` succeeds and quietly writes to the wrong place — this log
  // line is the only place that mistake is visible.
  conn.on('connected', () => {
    console.log(`  mongo: connected to "${conn.name}" at ${conn.host}`);
  });

  // No rethrow, no exit. See the rule at the top of this file.
  conn.on('error', (err) => {
    console.error(`  mongo: error - ${err.message}`);
  });

  // The one that explains a request which failed thirty seconds ago.
  conn.on('disconnected', () => {
    console.warn('  mongo: disconnected - saving and listing courses will fail until it returns');
  });

  // A blip needs a visible end as well as a visible start, or the log implies
  // the outage never finished.
  conn.on('reconnected', () => {
    console.log(`  mongo: reconnected to "${conn.name}"`);
  });
}

/**
 * Connect to MongoDB. Resolves whether or not the connection succeeded.
 *
 * Deliberately does NOT throw. The caller has nothing useful to do with a
 * failure — the decision has already been made that we boot anyway.
 *
 * @returns {Promise<boolean>} true if the initial connection succeeded
 */
export async function connectDB() {
  // 1. If features.database is false there is no MONGO_URI. Log that we are
  //    skipping, and return false. Do not attempt a connection with undefined —
  //    the driver error for that is far less clear than our own message.

  if (!features.database) {
    console.log('  mongo: no MONGO_URI set - skipping connection');
    return false;
  }

  // 2. registerConnectionEvents() — once, before connecting.

  registerConnectionEvents();

  // 3. Await mongoose.connect(config.MONGO_URI, { ... }).
  //    Set serverSelectionTimeoutMS explicitly. The default is 30_000, so a
  //    wrong URI makes boot appear to hang for half a minute before saying
  //    anything. Around 8000 is enough for Atlas from a laptop — the probe
  //    connected in 477ms — and fails fast enough to be debuggable.

  try {
    await mongoose.connect(config.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    });

    // 4. On success: return true.

    return true;
  } catch (err) {
    // 5. On failure: catch, log err.message with enough context that the reader
    //    knows the server is still running, and return false.
    //    Worth knowing: mongoose keeps retrying in the background after a failed
    //    initial connect. Returning false means "not up yet", NOT "never".

    console.error(`  mongo: initial connection failed - ${err.message}`);
    console.error('  mongo: server is still running, retrying in the background');

    return false;
  }
}

/**
 * The current state of the connection, in the words /api/health already uses.
 *
 * Reading readyState live on every call (rather than caching a boolean at
 * startup) is the entire point: a cached value would still say "up" ten minutes
 * after Atlas went away.
 *
 * @returns {'not configured' | 'connecting' | 'up' | 'down'}
 */
export function getDatabaseState() {
  // 1. If features.database is false -> 'not configured'.
  //    "No MONGO_URI" and "URI set but unreachable" have completely different
  //    fixes; keep them distinguishable.
  // 2. Otherwise map mongoose.connection.readyState through READY_STATE,
  //    defaulting to 'down' for any value not in the table.

  if (!features.database) return 'not configured';

  return READY_STATE[mongoose.connection.readyState] ?? 'down';
}

/**
 * Close the connection cleanly. Called from the SIGTERM handler in server.js.
 *
 * Without this, a redeploy leaves the socket to drop on its own. Harmless most
 * of the time, but it is one line and it makes shutdown symmetric with startup.
 */
export async function disconnectDB() {
  // Only disconnect if there is something to disconnect — calling this on a
  // connection that never opened logs a confusing error.

  if (mongoose.connection.readyState === 0) return;

  await mongoose.connection.close();
  console.log('  mongo: connection closed');
}
