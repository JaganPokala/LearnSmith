/**
 * The ONE place this server reads process.env. Loads the root .env in
 * development, validates at boot, and fails naming every problem at once.
 */

import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Built from THIS FILE's location, not process.cwd(). `npm start` runs with
// cwd = server/, but Render's start command may launch from elsewhere — a
// cwd-relative path works locally and stops working on the machine that matters.
const ROOT_ENV = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');

// On Render there is no .env file; the platform injects real variables. Record
// which mode we are in so /api/health can report it.
const envFileLoaded = existsSync(ROOT_ENV);

if (envFileLoaded) {
  loadDotenv({ path: ROOT_ENV, quiet: true });
}

/**
 * Every variable this server knows about. Adding one anywhere means adding a
 * row HERE, not a bare process.env read at the point of use — that is what
 * keeps /api/health and the README from drifting.
 *
 *   required : boot fails if absent
 *   warn     : boot continues, but says loudly what will not work
 *   fallback : value used when absent
 *   secret   : never print the value, only whether it is set
 *   number   : must parse as an integer
 */
const SPEC = [
  { key: 'NODE_ENV', fallback: 'development' },
  { key: 'PORT', fallback: '5000', number: true },
  { key: 'CLIENT_ORIGIN', fallback: 'http://localhost:5173' },

  { key: 'OPENAI_API_KEY', required: true, secret: true },
  { key: 'OPENAI_TEXT_MODEL', required: true },

  // Unset must not block boot, but must not be silent either: "no courses
  // found" and "no database" look identical from the outside.
  { key: 'MONGO_URI', secret: true, warn: 'saving and listing courses will not work' },

  { key: 'OPENAI_TTS_MODEL', warn: 'Hinglish audio (Phase 10) will not work' },
  { key: 'YOUTUBE_API_KEY', secret: true, warn: 'lesson videos (Phase 9) will not work' },
  { key: 'AUTH0_ISSUER', warn: 'authentication (Phase 8) will not work' },
  { key: 'AUTH0_AUDIENCE', warn: 'authentication (Phase 8) will not work' },
];

/**
 * Placeholder values from .env.example.
 *
 * A placeholder is TRUTHY: `if (process.env.AUTH0_ISSUER)` passes on
 * "https://your-tenant.us.auth0.com/", so the server reports auth as working
 * and you find out at the first real login. Read from the template rather than
 * hardcoded, because a hardcoded list drifts the moment someone edits it.
 *
 * @param {string} examplePath   absolute path to .env.example
 * @returns {Map<string, string>} key -> the placeholder value
 */
function findPlaceholders(examplePath) {
  const placeholders = new Map();

  if (!existsSync(examplePath)) return placeholders;

  // processEnv: {} parses into a throwaway target instead of overwriting
  // process.env — that empty object is the important part.
  const { parsed } = loadDotenv({ path: examplePath, processEnv: {}, quiet: true });
  if (!parsed) return placeholders;

  // Careful: PORT=5000 and NODE_ENV=development are real defaults in the
  // template, not placeholders.
  const LOOKS_FAKE = /your-|example\.com|<[^>]+>|changeme/i;

  for (const [key, value] of Object.entries(parsed)) {
    if (LOOKS_FAKE.test(value)) placeholders.set(key, value);
  }

  return placeholders;
}

// All problems collected and reported at the end. Exiting on the first means
// fixing five variables one Render redeploy at a time.
const values = {};
const missing = [];
const warnings = [];

const placeholders = findPlaceholders(resolve(dirname(ROOT_ENV), '.env.example'));

for (const item of SPEC) {
  // Trim: a key pasted with a trailing newline returns a 401 that looks exactly
  // like a revoked key.
  let value = process.env[item.key]?.trim() ?? '';

  if (value && value === placeholders.get(item.key)) {
    warnings.push(`${item.key} is still the .env.example placeholder ("${value}") - treating it as unset`);
    value = '';
  }

  if (value) {
    values[item.key] = value;
  } else {
    if (item.required) missing.push(item.key);
    else if (item.warn) warnings.push(`${item.key} is not set - ${item.warn}`);

    values[item.key] = item.fallback ?? null;
  }

  // Range-checked now, not inside listen(), where the error never mentions PORT.
  if (item.number && values[item.key] !== null) {
    const parsedNumber = Number(values[item.key]);

    if (!Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > 65535) {
      missing.push(`${item.key} must be an integer between 1 and 65535 (got "${values[item.key]}")`);
    } else {
      values[item.key] = parsedNumber;
    }
  }
}

// Failing here is the entire point: an unset API key discovered inside a
// request handler is a 500 on the live demo instead.
if (missing.length > 0) {
  console.error('\nCannot start: required configuration is missing or invalid.\n');

  for (const problem of missing) {
    console.error(`  - ${problem}`);
  }

  // The person reading this at 2am may not be on their own machine.
  if (envFileLoaded) {
    console.error(`\nAdd them to ${ROOT_ENV} and restart.\n`);
  } else {
    console.error('\nNo .env file was found.');
    console.error(`  Locally  : copy .env.example to ${ROOT_ENV} and fill it in.`);
    console.error('  On Render: set them under Environment in the service dashboard.\n');
  }

  process.exit(1);
}

// Not fatal, but visible — a silent degraded mode is how you debug the wrong
// thing for an hour.
if (warnings.length > 0) {
  console.warn('\nStarting with reduced functionality:\n');

  for (const warning of warnings) {
    console.warn(`  - ${warning}`);
  }

  console.warn('');
}

/** Frozen so a stray assignment cannot reconfigure the app at runtime. */
export const config = Object.freeze({
  ...values,

  isProduction: values.NODE_ENV === 'production',

  // So /api/health can say which mode this process is in.
  envFileLoaded,
  envFilePath: ROOT_ENV,
});

/**
 * Which optional features are usable right now. DERIVED from config, never a
 * second hand-maintained list — two lists drift, and then /api/health lies.
 */
export const features = Object.freeze({
  database: Boolean(config.MONGO_URI),

  // A key with no model id cannot generate anything, and a model id with no key
  // is just a string.
  generation: Boolean(config.OPENAI_API_KEY && config.OPENAI_TEXT_MODEL),
  tts: Boolean(config.OPENAI_API_KEY && config.OPENAI_TTS_MODEL),

  video: Boolean(config.YOUTUBE_API_KEY),
  auth: Boolean(config.AUTH0_ISSUER && config.AUTH0_AUDIENCE),
});

/**
 * Config safe to log or serve: secrets replaced by a presence flag and a
 * character count. The count matters — a truncated paste is a common cause of
 * 401s, and "set" and "set but wrong" otherwise look identical.
 *
 * @returns {Record<string, unknown>}
 */
export function describeConfig() {
  const described = {};

  // Walking SPEC, not config: stable order, and the extras (isProduction,
  // envFilePath) stay out of anything served over HTTP.
  for (const item of SPEC) {
    const value = config[item.key];

    if (item.secret) {
      described[item.key] = value ? `set (${value.length} chars)` : null;
    } else {
      described[item.key] = value;
    }
  }

  return described;
}
