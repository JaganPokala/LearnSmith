/**
 * server/config/env.js
 *
 * The ONE place this server reads process.env. Everything else imports `config`
 * from here.
 *
 * Two jobs:
 *   1. Load the root .env during development.
 *   2. Validate at boot and fail loudly, naming every problem at once.
 */

import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// 1. Work out where the root .env lives.
// ---------------------------------------------------------------------------
// Build the path from THIS FILE's location, not from process.cwd().
// `npm start` runs with cwd = server/, but Render's start command and your
// debugger may launch from elsewhere. A cwd-relative path works on your machine
// and mysteriously stops working on the one that matters.
//
// import.meta.url is a file:// URL -> fileURLToPath -> dirname -> go up twice
// (config/ -> server/ -> project root).

const ROOT_ENV = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');


// ---------------------------------------------------------------------------
// 2. Load it, but only if it exists.
// ---------------------------------------------------------------------------
// On Render there IS no .env file - the platform injects real environment
// variables. A missing file is normal there, NOT an error. Record whether we
// loaded one so /api/health can report which mode we are in.
//
// Pass { quiet: true } so dotenv does not print its own banner.

const envFileLoaded = existsSync(ROOT_ENV);

if (envFileLoaded) {
  loadDotenv({ path: ROOT_ENV, quiet: true });
}

// ---------------------------------------------------------------------------
// 3. The spec: every variable this server knows about, in one list.
// ---------------------------------------------------------------------------
// Adding a variable anywhere in this project means adding a row HERE, not a
// bare process.env read at the point of use. This list is what keeps
// /api/health and your README honest instead of slowly drifting.
//
//   required : boot fails if absent
//   warn     : boot continues, but says loudly what will not work
//   fallback : value used when absent
//   secret   : never print the value, only whether it is set
//   number   : must parse as an integer

const SPEC = [
  { key: 'NODE_ENV', fallback: 'development' },
  { key: 'PORT', fallback: '5000', number: true },
  { key: 'CLIENT_ORIGIN', fallback: 'http://localhost:5173' },

  { key: 'OPENAI_API_KEY', required: true, secret: true },
  { key: 'OPENAI_TEXT_MODEL', required: true },

  // Not required yet - Phase 2 wires the database. Until then an unset value
  // must not block boot, but it must not be silent either: "no courses found"
  // and "no database" look identical from the outside.
  { key: 'MONGO_URI', secret: true, warn: 'saving and listing courses will not work' },

  { key: 'OPENAI_TTS_MODEL', warn: 'Hinglish audio (Phase 10) will not work' },
  { key: 'YOUTUBE_API_KEY', secret: true, warn: 'lesson videos (Phase 9) will not work' },
  { key: 'AUTH0_ISSUER', warn: 'authentication (Phase 8) will not work' },
  { key: 'AUTH0_AUDIENCE', warn: 'authentication (Phase 8) will not work' },
];

/**
 * Collect values in .env.example that are obviously fill-me-in placeholders.
 *
 * Why this exists: a placeholder is TRUTHY. `if (process.env.AUTH0_ISSUER)`
 * passes happily on "https://your-tenant.us.auth0.com/", so the server reports
 * auth as working and you find out at your first real login - with a symptom
 * pointing at Auth0 instead of at .env.
 *
 * Read them from .env.example rather than hardcoding a list of known-fake
 * strings: a hardcoded list drifts the moment someone edits the template.
 *
 * @param {string} examplePath   absolute path to .env.example
 * @returns {Map<string, string>} key -> the placeholder value
 */


function findPlaceholders(examplePath) {
  // 1. If the file does not exist, return an empty Map. A missing template is
  //    not an error, it just means this check cannot run.

  // 2. Parse it WITHOUT touching the real environment. loadDotenv accepts
  //    { path, processEnv: {} } - the empty object is the important part, it
  //    parses into a throwaway target instead of overwriting process.env.
  //    The return value has a `.parsed` property holding the key/value object.

  // 3. Keep only entries whose value LOOKS like a placeholder: contains
  //    "your-", "example.com", <angle brackets>, or "changeme".
  //    Careful - PORT=5000 and NODE_ENV=development are real defaults in the
  //    template, not placeholders. Do not flag those.

  // 4. Return a Map of key -> placeholder value.
  const placeholders = new Map();

  if (!existsSync(examplePath)) return placeholders;

  const { parsed } = loadDotenv({ path: examplePath, processEnv: {}, quiet: true });
  if (!parsed) return placeholders;

  const LOOKS_FAKE = /your-|example\.com|<[^>]+>|changeme/i;

  for (const [key, value] of Object.entries(parsed)) {
    if (LOOKS_FAKE.test(value)) placeholders.set(key, value);
  }

  return placeholders;
}

// ---------------------------------------------------------------------------
// 4. Validate every entry in SPEC.
// ---------------------------------------------------------------------------
// Collect problems into these arrays and report them ALL at the end. Do not
// exit on the first one: fixing five variables one Render redeploy at a time is
// five redeploys at roughly two minutes each.

const values = {};
const missing = [];
const warnings = [];

// Placeholder values are read once, here, so the loop below can compare
// against them without re-parsing .env.example ten times.
const placeholders = findPlaceholders(resolve(dirname(ROOT_ENV), '.env.example'));

for (const item of SPEC) {
  // Trim: a key pasted with a trailing newline returns a 401 that looks
  // exactly like a revoked key.
  let value = process.env[item.key]?.trim() ?? '';

  // A placeholder is truthy, so it has to be knocked out by name.
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

  // Range-check now, not inside listen(), where the error never mentions PORT.
  if (item.number && values[item.key] !== null) {
    const parsedNumber = Number(values[item.key]);

    if (!Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > 65535) {
      missing.push(`${item.key} must be an integer between 1 and 65535 (got "${values[item.key]}")`);
    } else {
      values[item.key] = parsedNumber;
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Stop the server if anything required is absent.
// ---------------------------------------------------------------------------
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

// Not fatal, but they must be visible - a silent degraded mode is how you end
// up debugging the wrong thing for an hour.
if (warnings.length > 0) {
  console.warn('\nStarting with reduced functionality:\n');

  for (const warning of warnings) {
    console.warn(`  - ${warning}`);
  }

  console.warn('');
}

/**
 * Frozen so a stray assignment somewhere else cannot reconfigure the app at
 * runtime.
 */
export const config = Object.freeze({
  ...values,

  isProduction: values.NODE_ENV === 'production',

  // Carried so /api/health can say which mode this process is in, and so an
  // error thrown anywhere else can name the exact file it wanted.
  envFileLoaded,
  envFilePath: ROOT_ENV,
});

/**
 * Which optional features are actually usable right now.
 *
 * DERIVED from `config` - never a second hand-maintained list. Two lists always
 * drift, and the moment they do, /api/health starts lying about what works.
 */
export const features = Object.freeze({
  database: Boolean(config.MONGO_URI),

  // A key with no model id cannot generate anything, and a model id with no
  // key is just a string - both halves or the feature is off.
  generation: Boolean(config.OPENAI_API_KEY && config.OPENAI_TEXT_MODEL),
  tts: Boolean(config.OPENAI_API_KEY && config.OPENAI_TTS_MODEL),

  video: Boolean(config.YOUTUBE_API_KEY),
  auth: Boolean(config.AUTH0_ISSUER && config.AUTH0_AUDIENCE),
});

/**
 * Config that is safe to log or serve over HTTP: secrets replaced by a presence
 * flag and a character count.
 *
 * Keep the character count. A truncated paste is a common cause of 401s and is
 * otherwise completely invisible - "set" and "set but wrong" look identical.
 *
 * @returns {Record<string, unknown>}
 */
export function describeConfig() {
  const described = {};

  // Walking SPEC, not config: stable order, and the step-5 extras
  // (isProduction, envFilePath) stay out of anything served over HTTP.
  for (const item of SPEC) {
    const value = config[item.key];

    if (item.secret) {
      // The char count is the point - it is the only way "set" and
      // "set but truncated" look different from the outside.
      described[item.key] = value ? `set (${value.length} chars)` : null;
    } else {
      described[item.key] = value;
    }
  }

  return described;
}


/*
  load env variable is there -> store placeholder values from .env.example
  -> now check all the available .env variables are present or not if no, store
  them and throw all of them at once instead of one by one -> if yes then create 
  a config object and freeze it so that we won't modify it -> and also create a
  feature obj 
*/