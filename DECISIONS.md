# DECISIONS.md

Every non-obvious choice, and what was rejected.

Anyone can say "I used X." Being able to say *"I used X over Y because Z, and here is what
it cost me"* is what separates a decision from a default.

Write an entry when you pick a library, an approach, a data shape, or an order of work —
and when you decide **not** to do something.

---

## D1 — One file owns `process.env`, driven by a declarative `SPEC` array
**Date:** 2026-08-27

**Chose:** `server/config/env.js` is the only module in the server that reads
`process.env`. Everything else imports `config`, `features`, or `describeConfig()` from it.
Validation is driven by a `SPEC` array — one row per variable, declaring whether it is
`required`, what it should `warn` about, its `fallback`, and whether it is a `secret` or a
`number`. The loop that validates is generic; the knowledge lives in the data.

**Rejected:** reading `process.env.X` at each point of use, with an `if (!x) throw` where
it matters. That is the normal way, it is less code, and it works — right up until you
deploy. Its real cost is invisibility: a variable read inside a route handler is a
requirement that does not appear in your README, cannot be reported by `/api/health`, and
is only discovered when that specific route runs in production.

**Also rejected:** a hand-written `features` object listing what works. Two lists always
drift, and the moment they do, the health endpoint starts lying. `features` is *derived*
from `config`, so it cannot disagree with what the code actually requires.

**Cost:**
- Every new variable means editing the `SPEC` list. Mildly annoying, and precisely the
  friction that stops config drifting.
- The file is ~190 lines to do something a five-line `if` could fake.
- All validation is top-level module code, so importing `env.js` has the side effect of
  possibly calling `process.exit(1)`. That is deliberate — it is what makes it impossible
  to reach `Object.freeze({...values})` with a required key missing — but it does mean
  this module cannot be imported by a test that wants to survive bad config.

**What it bought, measured:** emptying `OPENAI_API_KEY` exits 1 before the server listens,
naming the key and the exact `.env` path. Breaking three variables at once reports all
three, not just the first — five fixes at one Render redeploy each (~2 min) becomes one.
With no `.env` file at all the error text switches to Render-specific instructions.

**Would reverse if:** the server ever needed to run in-process inside a test suite that
deliberately feeds it broken config. Then validation would move into an exported
`loadConfig()` that throws instead of exiting, and `server.js` would call it.

---

## D2 — Placeholder values are detected by comparing against `.env.example`
**Date:** 2026-08-27

**Chose:** `findPlaceholders()` parses `.env.example` into a throwaway object and builds a
Map of keys whose template value looks like a fill-me-in (`your-`, `example.com`,
`<...>`, `changeme`). Any `.env` value byte-identical to its template value is treated as
**unset**, with a warning naming the key.

**Why at all:** a placeholder is truthy. `if (process.env.AUTH0_ISSUER)` passes happily on
`https://your-tenant.us.auth0.com/`, so the server reports auth as working and the failure
surfaces at the first real login — with a symptom pointing at Auth0 rather than at `.env`.

**Rejected:** a hardcoded array of known-fake strings. It drifts the moment anyone edits
the template, and a check that silently stops matching is worse than no check.

**Cost:** ~20 lines, one extra file read at boot, and it is currently **inert** — the
committed `.env.example` has empty values, so there is nothing to match. It only starts
earning its keep in Phase 8, when `.env.example` gains a realistic Auth0 issuer as a hint.
Verified working by temporarily injecting a placeholder into both files: the value resolved
to `null` and `features.auth` went `false`.

**Would reverse if:** it ever produces a false positive on a legitimate value — a real
config value containing the word "example" would be knocked out with a confusing warning.

---

## D3 — CORS allows one exact origin, and is treated as a browser hint, not access control
**Date:** 2026-08-27

**Chose:** `app.use(cors({ origin: config.CLIENT_ORIGIN }))` — a single exact origin read
from config, registered before any route. `credentials` is deliberately left off.

**The mechanism, because it is counter-intuitive:** passing a fixed string as `origin`
makes the `cors` package emit that string as `Access-Control-Allow-Origin` on *every*
response. It never compares it to the incoming `Origin` header. A request from
`https://evil.com` still runs the handler, still returns `200`, and still receives the
header — the header just says `http://localhost:5173`, which does not match evil.com's own
origin, so **the browser discards the response**. Enforcement happens in the browser, never
on the server.

**The consequence:** CORS is **not access control**. The evil.com request executed and
produced a real body; `curl`, Postman, and any server-side script ignore CORS entirely and
get the data. What CORS prevents is narrow and specific: *a script on another site, running
in a logged-in user's browser, reading this API's responses*. Anything that must actually
be denied needs auth on the route (Phase 8), not this middleware. Writing "CORS secures the
API" in the README would be wrong.

**Rejected:** `origin: '*'`. It lets any site on the internet call this API from a
visitor's browser, and it stops working the moment `credentials: true` is needed, because
browsers reject wildcard + credentials. Rejecting it costs nothing today and avoids a
confusing failure later.

**Rejected for now:** `credentials: true`. It is only needed for cookies, and the Phase 8
plan is an Auth0 bearer token in an `Authorization` header. Turning it on before anything
needs it would be cargo cult.

**Verified, measured** (live listener, four requests):

| request | status | `Access-Control-Allow-Origin` |
| --- | --- | --- |
| GET from `http://localhost:5173` | 200 | `http://localhost:5173` |
| GET from `https://evil.com` | 200 | `http://localhost:5173` |
| GET with no `Origin` (curl) | 200 | `http://localhost:5173` |
| preflight `OPTIONS` + `Authorization` | 204 | `http://localhost:5173` |

The preflight also reflected `allow-headers: authorization, content-type` automatically,
which means Auth0's bearer token will pass in Phase 8 with no `allowedHeaders` config.

**Cost:**
- One origin means exactly one frontend. At Phase 6, `CLIENT_ORIGIN` must become the exact
  Vercel production URL, and **every Vercel preview deployment gets a different hostname
  and will be blocked** until added. Expect to hit this the first time a preview link is
  shared.
- The rejected wildcard would have made all of that Just Work, at the price above.

**Would reverse if:** preview deployments become part of the workflow. Then `origin`
becomes a function that allows the production URL plus a `*.vercel.app` pattern — a
function, not a wildcard, so the check stays explicit.

---

## D4 — `/api/health` returns 200 even when the database is down
**Date:** 2026-08-27

**Chose:** the health route always answers `200`. Database state is reported in the body as
`db: 'up' | 'down' | 'not configured'`, never in the status code.

**The reasoning:** Render restarts services that fail their health check. If an Atlas hiccup
made this endpoint return `503`, Render would kill and restart a perfectly healthy Node
process — which does not fix Atlas, and adds a restart loop on top of the original problem.
The question this route answers is *"is this process alive"*. Whether Mongo is reachable is
**information**, not a verdict on the process.

**Rejected:** `503` when degraded. It is the more "honest-looking" option and it is what most
tutorials show, but it hands your uptime to a dependency you do not control.

**Cost — the real one:** a monitoring tool that watches only status codes will **never** alert
that the database is gone. Everything looks green while nothing can be saved. That alerting
has been traded away for stability, and getting it back means watching the response *body*,
not the code.

**Second cost:** "healthy" now means something weaker than a reader might assume. Anyone
wiring up alerts later has to read this entry to know that.

**Three states, not a boolean:** `not configured` (no `MONGO_URI`) and `down` (set but
unreachable) have completely different fixes — a missing env var versus Atlas or the network.
A boolean shows `false` for both and sends you debugging the wrong one. Verified:

| `MONGO_URI` | `db` | `features.database` | status |
| --- | --- | --- | --- |
| unset | `not configured` | `false` | 200 |
| garbage srv URI | `down` | `true` | 200 |

**Also decided:** the response carries `features`, not `describeConfig()`. The route is public
and unauthenticated; `features` says what works without publishing model ids and origins.
Measured: 151 bytes, containing no API key, no model id, no filesystem path.

**Would reverse if:** an uptime monitor becomes the primary alerting channel and body
inspection is not available in it. Even then the better fix is a *separate* `/api/health/deep`
that does return 503, leaving this one as the liveness probe Render polls.

---

## D5 — No `asyncHandler` wrapper: Express 5 forwards async rejections natively
**Date:** 2026-08-27

**Chose:** nothing. Async route handlers are written as plain `async` functions and their
rejections reach `errorHandler` unaided.

**Rejected:** `express-async-handler`, or a hand-rolled
`const asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)`
applied to every async route. This is what almost every Express tutorial and StackOverflow
answer still says to do — because they were written for Express 4, where a rejected promise
inside a handler reaches nothing at all and the request **hangs forever**: no error, no
response, no timeout.

**Why the assumption had to be tested rather than inherited:** guessing wrong is costly in
both directions. Assume Express 4 behaviour and you carry a wrapper through every route in
Phases 4-9 and must remember to apply it every time. Assume Express 5 behaviour without
checking and, if wrong, you get a hang with no error message anywhere.

**Measured** on Express 5.2.1, with a route that awaits then throws:

| route | result |
| --- | --- |
| sync `throw` | 500 JSON in 4ms |
| `async` reject | **500 JSON in 21ms** - forwarded, no hang |

**Cost:** a version dependency that is invisible in the code. Nothing in `server.js` says
"this only works because Express is v5". Downgrading Express, or copying a route into an
Express 4 project, silently reintroduces the hang. Mitigated by pinning `^5.2.1` and by this
entry.

**Would reverse if:** Express is ever downgraded, or routes are extracted into a library
that might run under Express 4.

---

## D6 — Error responses split on `isOperational`, not on status code
**Date:** 2026-08-27

**Chose:** one envelope for every failure - `{ error: { code, message } }` - where `code` is a
stable snake_case identifier for the client to branch on and `message` is prose for a human.
Which message actually ships is decided by `err.isOperational`, a flag set only by `ApiError`:

- **operational** (we anticipated this and wrote the message): sent verbatim, in every
  environment.
- **unplanned** (a real bug - `TypeError`, a driver failure): generic text in production,
  the real message plus stack in development.

**Rejected: hiding everything with status >= 500.** Simpler, and it throws away the useful
half. A deliberate `ApiError(500, 'generation_failed', 'The AI returned invalid JSON twice')`
is exactly the message a user should see, and a status-based rule would replace it with
"something went wrong".

**Rejected: showing everything.** An unplanned error's `.message` can contain a filesystem
path, a query, or part of a connection string. Verified: a thrown `Error` whose message
embedded a path returned that path verbatim in development.

**Measured**, same crash in both environments:

| environment | unplanned crash | deliberate `ApiError` |
| --- | --- | --- |
| development | real message + full stack | real message |
| production | `Something went wrong on our end.` no stack | `No course with that id` |

Nine checks total, including: `err.status` (body-parser) and `err.statusCode` (ApiError) both
honoured - malformed JSON returns 400 `bad_request`, not 500; a throw after `res.write()` does
not double-send or crash; the process survived four thrown errors and kept serving.

**Cost:**
- Every deliberate error must go through `ApiError` or its message silently becomes generic
  in production. That is a convention no linter enforces - a plain `throw new Error('Course
  not found')` will look right locally and read as "Something went wrong" once deployed.
- In development a 404 body is ~1.2kb of stack for a 40-byte message. Noisy. If it gets in
  the way during Phase 5, dropping `stack` from 404s specifically is reasonable - a 404
  rarely needs one, a 500 always does.

**Would reverse if:** the client ever needs richer failure data (field-level validation
errors). Then `error` gains an optional `details` array rather than changing the envelope.

---

<!-- Template — copy for each entry:

## D<n> — <the decision, in one line>
**Date:**

**Chose:** what you did.

**Rejected:** the alternative, and the specific reason it lost. "It was worse" is not a
reason. "It needed a second API key and I had one afternoon" is.

**Cost:** what this choice makes harder, slower, or uglier. Every real decision has one.
If you can't name a cost, you probably haven't made a decision yet.

**Would reverse if:** the fact that would change your mind.

-->
