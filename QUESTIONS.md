# QUESTIONS.md

Five questions per component, **answered from this codebase** — not from the documentation.

Five gives you defensible depth and a clear stopping point. Without a number, "understanding
it" never terminates.

**A question is closed only when the answer cites a file, a line, or a number you measured
here.** "The docs say X" is not an answer. "`server/config/env.js` exits 1 and I saw it" is.

These are the questions an interviewer asks after you say "I built an AI course generator."

---

## Component: Configuration & environment

**1. What happens when a required variable is missing?**
The process exits 1 *before* `listen()` is ever called, printing every missing key at once —
not just the first. Emptying `OPENAI_API_KEY` produced `- OPENAI_API_KEY` plus the exact
`.env` path; breaking three at once listed all three, including
`PORT must be an integer between 1 and 65535 (got "not-a-number")`.

**2. How does the server behave with no `.env` file at all?**
Normally — `existsSync` guards the load, so a missing file is not an error, and
`config.envFileLoaded` becomes `false`. With platform variables set (the Render case) it
booted with `PORT: 10000, isProduction: true`. With nothing set, it exits 1 and the guidance
text switches to "On Render: set them under Environment in the service dashboard."

**3. What stops a placeholder from being treated as a real value?**
`findPlaceholders()` parses `.env.example` into a throwaway object (`processEnv: {}`) and the
validation loop nulls any `.env` value byte-identical to its template value. Tested by
injecting `AUTH0_ISSUER=https://your-tenant.us.auth0.com/` into both files: it resolved to
`null` and `features.auth` went `false`, instead of truthily reporting auth as working.

**4. Which variables are required versus optional, and where is that decided?**
Entirely in the `SPEC` array — `required: true` on `OPENAI_API_KEY` and `OPENAI_TEXT_MODEL`
kills boot; everything else carries a `warn` string and only degrades. `MONGO_URI` is
deliberately warn-only until Phase 2, so the server can still answer `/api/health` with
`db: down` rather than refusing to start.

**5. Can config be changed at runtime, and can `describeConfig()` leak a secret?**
No to both. `config` and `features` are `Object.freeze`d — assigning to
`config.OPENAI_TEXT_MODEL` left it unchanged. `describeConfig()` walks `SPEC` rather than
`config`, so secrets come out as `"set (164 chars)"` and the derived extras
(`isProduction`, `envFilePath`) never appear — verified the raw key is absent from its JSON.

## Component: Express backend

**1. What happens to a rejected promise inside a route handler?**
Express 5 forwards it to `errorHandler` on its own - a route that awaits then throws returned
`500` JSON in 21ms rather than hanging. On Express 4 the same route hangs forever with no
error and no response, which is why every tutorial says to wrap async handlers. We do not,
and `express-async-handler` is deliberately not a dependency (D5).

**2. What is the exact JSON shape of every error this API can return?**
Always `{ error: { code, message } }`, plus `error.stack` in development only. `code` is
stable snake_case for the client to branch on (`not_found`, `bad_request`,
`course_not_found`); `message` is prose. Verified identical across a 404, a 400 from a
malformed body, and a 500 from a thrown `Error`.

**3. What stops an unplanned crash from leaking file paths to a stranger?**
The `isOperational` flag, set only by `ApiError`. A thrown `Error` whose message contained
`/Users/secret/path/leak.js` returned that path verbatim in development and
`Something went wrong on our end.` with no stack in production - while a deliberate
`ApiError(404, 'course_not_found', ...)` kept its real message in both (D6).

**4. Why does `errorHandler` take four parameters, and why is it registered last?**
Express identifies error-handling middleware by `fn.length === 4`; drop the unused `next` and
it is silently treated as ordinary middleware, never runs on errors, and HTML pages come back
with no clue why. It is registered last because it only catches errors raised by middleware
above it - with `notFound` immediately before it, since that has to run after every real
route or it would swallow them.

**5. What is the middleware order, and what breaks if it is wrong?**
`cors` to `express.json({ limit: '10kb' })` to `morgan` to routes to `notFound` to
`errorHandler`. Put `express.json` after the routes and `req.body` is `undefined` inside them,
silently. Put `cors` after them and the browser discards a response the handler worked to
produce. The 10kb cap is on *incoming* bodies only - generated course responses going out are
unbounded, and returned `413` for a 20kb POST.

## Component: Mongoose models

1.
2.
3.
4.
5.

## Component: AI generation service

1.
2.
3.
4.
5.

## Component: React frontend

1.
2.
3.
4.
5.

## Component: Auth0

1.
2.
3.
4.
5.

## Component: Deployment

1.
2.
3.
4.
5.
