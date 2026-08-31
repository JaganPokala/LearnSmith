/**
 * Owns the MongoDB connection. Nothing else imports mongoose to ask about
 * connection state.
 *
 * THE RULE: never process.exit on a connection failure. A lost database is a
 * degraded mode, not a fatal one, and a crash-loop on Render is far harder to
 * diagnose than a running server that reports db: "down".
 */

import mongoose from 'mongoose';
import { config, features } from './env.js';

// mongoose.connection.readyState is a number. 2 is the one everyone forgets:
// during startup and during a reconnect the connection is neither up nor down.
const READY_STATE = {
  0: 'down', // disconnected
  1: 'up', // connected
  2: 'connecting', // handshake in progress, or reconnecting after a drop
  3: 'down', // disconnecting
};

let eventsRegistered = false;

/**
 * Pure logging, no reconnection — mongoose reconnects on its own, silently.
 * Without these, the first sign of trouble is a request failing for no reason.
 */
function registerConnectionEvents() {
  // Duplicate listeners log every event twice, which reads exactly like the
  // event firing twice.
  if (eventsRegistered) return;
  eventsRegistered = true;

  const conn = mongoose.connection;

  // The DATABASE name, not just the host: Mongo creates whatever name you ask
  // for, so a typo in the URI path succeeds and writes to the wrong place.
  conn.on('connected', () => {
    console.log(`  mongo: connected to "${conn.name}" at ${conn.host}`);
  });

  conn.on('error', (err) => {
    console.error(`  mongo: error - ${err.message}`);
  });

  conn.on('disconnected', () => {
    console.warn('  mongo: disconnected - saving and listing courses will fail until it returns');
  });

  // A blip needs a visible end as well as a start, or the log implies the
  // outage never finished.
  conn.on('reconnected', () => {
    console.log(`  mongo: reconnected to "${conn.name}"`);
  });
}

/**
 * Connect to MongoDB. Never throws — the decision to boot anyway is already
 * made, so the caller has nothing useful to do with a failure.
 *
 * @returns {Promise<boolean>} true if the initial connection succeeded
 */
export async function connectDB() {
  if (!features.database) {
    console.log('  mongo: no MONGO_URI set - skipping connection');
    return false;
  }

  // Once, and before connecting — register after and the first 'connected'
  // event is missed entirely.
  registerConnectionEvents();

  try {
    // The default is 30_000, so a wrong URI makes boot appear to hang for half
    // a minute. Atlas connects in ~490ms from a laptop.
    await mongoose.connect(config.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    });

    return true;
  } catch (err) {
    // mongoose keeps retrying in the background, so false means "not up yet",
    // not "never".
    console.error(`  mongo: initial connection failed - ${err.message}`);
    console.error('  mongo: server is still running, retrying in the background');

    return false;
  }
}

/**
 * The current state, in the words /api/health uses. Read live every call — a
 * value cached at startup would still say "up" ten minutes after Atlas left.
 *
 * @returns {'not configured' | 'connecting' | 'up' | 'down'}
 */
export function getDatabaseState() {
  // "No MONGO_URI" and "URI set but unreachable" have different fixes.
  if (!features.database) return 'not configured';

  return READY_STATE[mongoose.connection.readyState] ?? 'down';
}

/** Close cleanly. Called from the SIGTERM handler in server.js. */
export async function disconnectDB() {
  // Closing a connection that never opened logs a confusing error.
  if (mongoose.connection.readyState === 0) return;

  await mongoose.connection.close();
  console.log('  mongo: connection closed');
}
