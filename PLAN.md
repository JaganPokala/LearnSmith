# PLAN.md — Text-to-Learn: AI-Powered Course Generator

Source spec: `Hackathon Roadmap.docx` (13 milestones).
Deliverables: live public URL · GitHub repo with real commit history · 5-minute demo video.
Judged on: functionality · code quality · design/UI · creativity.

---

## How we work

1. Before each **phase**, I explain what it builds and why it comes here.
2. Before each **task**, I explain what it does. You ask questions if you have them.
3. I give **boilerplate only** — imports, function signature, a short docstring, and
   numbered step comments. No working bodies.
4. **You write the code.**
5. You ask me to verify. I run it against real data and hostile inputs, and report numbers.

Tasks marked **[PLUMBING]** are config wiring with nothing to learn — say the word and I'll
just write those.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite + Chakra UI + React Router v6 |
| Backend | Node 22 + Express 5 (ESM) |
| Database | MongoDB Atlas + Mongoose |
| AI | OpenAI (`openai` v7) — text generation + TTS |
| Video | YouTube Data API v3 |
| Auth | Auth0 (OAuth2 / JWT) |
| PDF | jsPDF + html2canvas |
| Hosting | Render (server) · Vercel (client) |

Monorepo: `project-root/{server,client}`.

## Phase order

Phases are ordered as a **vertical slice**, not as the milestone list in the docx. The goal
is a working prompt→course→screen loop as early as Phase 5, then deploy it immediately at
Phase 6, then add depth. Two reasons:

- The docx order describes the *finished system*, not a build sequence. Following it means
  the first moment you can tell whether the idea works is also the last.
- CORS, Auth0 callback URLs, env-var drift, and cold starts fail **only** in production.
  Meeting them at Phase 6 against a 3-file app costs an afternoon. Meeting them at the end
  against a finished app costs the submission.

**If time runs short**, cut in this order: 10 (TTS) → 11 (PDF) → 9 (video) → 8 (Auth0, fall
back to a demo user). **Never cut Phase 6 or Phase 12.** A partial app that is deployed and
documented beats a complete one that is neither.

---

# Phase 0 — Repo and configuration foundation

Everything later depends on secrets loading correctly and never being committed. Small
phase, but a leaked key or a config bug found in Phase 6 costs far more than it does here.

### Task 0.1 — `.gitignore` and `.env.example` **[PLUMBING]**
- **Files:** `.gitignore` (exists), new `.env.example`.
- **What:** `.env.example` lists every key the project will *ever* need, with empty values,
  so a missing one is a lookup instead of a hunt.
- **Verify:** `git check-ignore -v .env` names the rule; `git status` never shows `.env`.

### Task 0.2 — `server/config/env.js`
- **What:** the single place the server reads `process.env`. Validates at boot, reports
  *every* problem at once, exports a frozen `config` plus a derived `features` map.
- **Why one file:** any `process.env.X` read elsewhere is a config requirement invisible to
  your README and your health endpoint. One source, no drift.
- **Traps:** production (Render) has **no `.env` file** — vars come from the dashboard, so a
  missing file is normal, not an error. Resolve the path from the module, not `process.cwd()`.
  A placeholder value copied from `.env.example` is truthy and will pass every `if (x)` check.
- **Verify:** boots normally; empty a required var → exits 1 naming it; break three at once
  → all three listed; run with no `.env` but real env vars → boots.

---

# Phase 1 — Backend skeleton

A server that starts, answers, logs, and fails in one predictable shape. Every later route
inherits this.

### Task 1.1 — `server/server.js` **[partly PLUMBING]**
- **What:** Express app — `cors`, `express.json`, `morgan`, listen, graceful SIGTERM.
- **Trap:** Render sends SIGTERM on redeploy; without a handler you drop live requests.
- **Verify:** `npm start` listens; `GET /` returns JSON.

### Task 1.2 — `GET /api/health` → `server/routes/health.js`
- **What:** returns `{ ok, uptime, db, features }`. Your first debugging tool in production.
- **Trap:** `features` must be **derived** from config, never a second hand-maintained list.
- **Verify:** 200 before the DB is wired, with `db: "down"` — not a 500.

### Task 1.3 — Central error handler + 404 → `server/middlewares/errorHandler.js`
- **What:** every error leaves as `{ error: { code, message } }`. One shape, always.
- **Trap:** Express's default handler returns an **HTML stack trace with absolute file
  paths**. Non-JSON breaks client error handling and the paths are a disclosure.
- **Note:** Express 5 forwards async rejections automatically — unlike Express 4. **Test
  this before writing an `asyncHandler` wrapper**; you may not need one.
- **Verify:** a sync-throwing route, an async-rejecting route, and a malformed JSON body all
  return JSON with the right status, and the process stays alive.

---

# Phase 2 — Data layer

### Task 2.1 — `server/config/db.js`
- **What:** `connectDB()` with connection-event logging and a readable state getter.
- **Trap:** do **not** `process.exit` on first failure — Task 1.2 promised the server
  answers with `db: "down"`.
- **Verify:** start with a deliberately wrong URI → logged failure, health says `down`,
  server still responds.

### Task 2.2 — `Course`, `Module`, `Lesson` schemas
- **Files:** `server/models/{Course,Module,Lesson}.js`.
- **What:** the hierarchy from Milestone 5. `creator` (Auth0 `sub`) indexed.
- **Trap:** lesson `content` is `[Mixed]`, which Mongoose does **not** validate at all.
  Whatever the AI returns gets saved. Validation must live in Phase 3.
- **Verify:** save a course + module + lesson, re-read with `.populate()`, print the tree.

### Task 2.3 — Cascade delete
- **What:** deleting a course removes its modules and their lessons.
- **Verify:** build a 2×3 tree, delete the course, count all three collections → all 0.

---

# Phase 3 — AI generation service

The core of the project and the part most likely to break. Everything here is about turning
a text response into data you can trust.

### Task 3.0 — Look at one raw response first
- **What:** a throwaway script: one OpenAI call, print the response verbatim between visible
  delimiters. Delete it after.
- **Why first:** you will design the parser around what the model *actually* returns, not
  what you assume. Expect markdown code fences and inconsistent field names.
- **Verify:** you can describe, from what you saw, exactly why `JSON.parse(raw)` would fail.

### Task 3.1 — `server/services/openai.js`
- **What:** builds the client; `generateJSON({ prompt, schema })` using structured outputs.
- **Traps:** the SDK **retries twice by default** with backoff and has a **10-minute**
  timeout — both wrong for a request a user is waiting on. Strict schemas also constrain the
  schema itself (every property in `required`, `additionalProperties: false`).
- **Verify:** one real call; print latency and token usage.

### Task 3.2 — `server/services/prompts.js` — course prompt
- **What:** `buildCoursePrompt(topic)` per Milestone 8: foundational → advanced, 3–6 modules,
  3–5 lessons each.
- **Verify:** three real topics; print the module and lesson counts.

### Task 3.3 — `server/services/schemas.js` — the course schema
- **Trap:** structured outputs guarantee *shape*, not *array lengths*. The schema will
  happily return 1 module. **Verify what your schema actually enforces with a real call** —
  don't assume either way.
- **Verify:** generate, then assert counts in code, and report how many runs complied.

### Task 3.4 — `server/utils/parseAIJson.js`
- **What:** a pure `string → object` function. Strips fences, slices to the outermost braces,
  parses, throws a typed error on failure.
- **Why pure:** it's the one piece you can test against hostile strings without an API call.
- **Verify:** good JSON, fenced JSON, JSON with prose before it, truncated JSON, `""`,
  `null`, and `"not json at all"`. None may throw an unhandled error.

### Task 3.5 — `server/services/courseGenerator.js` — validate + one retry
- **What:** generate → parse → validate the contract → on violation, retry **once** with the
  violation text appended.
- **Trap:** a silent `catch` here makes "the model returned garbage" indistinguishable from
  "the model returned an empty course". Log both branches distinctly, with the inputs.
- **Verify:** force each failure path with a stubbed client — fenced text, prose, truncated
  JSON, an API error — and confirm the retry actually fires at least once.

### Task 3.6 — Lesson prompt + block schema
- **What:** blocks `heading | paragraph | code | video | mcq`, plus `objectives[]`, 4–5 MCQs
  with explanations. `video` carries a **search query**, never a URL.
- **Verify:** generate 3 lessons; assert every block `type` is known and every MCQ `answer`
  is a valid index into its own `options`.

---

# Phase 4 — Course and lesson API

### Task 4.1 — `POST /api/courses/generate`
- **What:** validate the prompt, generate, persist the whole tree, return it populated.
- **Verify:** a real topic works; then empty string, 5000 chars, emoji-only, missing field,
  and `null` — report the status code for each.

### Task 4.2 — `GET /api/courses/:id` and `GET /api/courses`
- **Verify:** valid id → 200, valid-but-absent → 404, malformed ObjectId → **400, not 500**.

### Task 4.3 — `POST /api/lessons/:id/generate` — lazy lesson content
- **What:** generate on first open, persist, set `isEnriched`, return the cached copy after.
- **Why lazy:** a 5×4 course is 20 AI calls up front, most for lessons nobody opens.
- **Trap:** this is **stateful**. Test call 2 after call 1 in the same database.
- **Verify:** time both calls and report both numbers. The second should be near-zero.

---

# Phase 5 — Frontend shell and first end-to-end slice

The first point where the project is demonstrable. Keep it plain; polish comes later.

### Task 5.1 — Vite + Chakra + Router scaffold **[PLUMBING]**
### Task 5.2 — `client/src/utils/api.js`
- **What:** one axios instance built from `import.meta.env.VITE_API_URL`.
- **Trap:** every hardcoded `localhost:5000` elsewhere survives silently into production.
- **Verify:** grep the client for `localhost:5000` — only this file may match.
### Task 5.3 — `PromptForm` → generate → navigate
### Task 5.4 — `LoadingSpinner` and `ErrorMessage`
- **Trap:** generation takes 10–20s. With no visible state users click twice and generate
  two courses. Disable the button while in flight.
- **Verify:** stop the backend → readable error, not a blank page. Double-click submit →
  exactly one POST in the network tab.
### Task 5.5 — `CoursePage` — modules and lesson list
- **Verify:** full loop, prompt to rendered course. **Screenshot it.**

---

# Phase 6 — Deploy it (early, on purpose)

### Task 6.1 — Render web service, root `/server` **[PLUMBING]**
### Task 6.2 — Vercel project, root `/client` **[PLUMBING]**
### Task 6.3 — CORS and env vars for the live origins
- **Trap:** Render's free tier cold-starts (tens of seconds). Decide now how you'll handle
  that during the demo and write the decision down.
- **Verify:** run the whole flow from the live URL in an incognito window. Time the first
  request and the second.
### Task 6.4 — GitHub Actions: install + build both apps on PR **[PLUMBING]**
- **Verify:** open a PR with a deliberate syntax error → CI goes red.

---

# Phase 7 — Lesson rendering

### Task 7.1 — `LessonRenderer` dispatch
- **Trap:** an unknown block `type` must render a visible fallback, not vanish. A silently
  dropped block looks exactly like a block the AI never produced.
- **Verify:** feed it `type: "banana"` and confirm something renders.
### Task 7.2 — `HeadingBlock`, `ParagraphBlock`
### Task 7.3 — `CodeBlock` with syntax highlighting
- **Trap:** `language` will sometimes be missing or unrecognised. Must not crash the page.
### Task 7.4 — `MCQBlock` with answer reveal and explanation
- **Verify:** answer state is per-question, not shared across the page.
### Task 7.5 — `LessonPage` + route wiring
- **Verify:** deep-link a lesson URL in a fresh tab — loads without going via Home.

---

# Phase 8 — Auth0

### Task 8.1 — Tenant and application registration **[PLUMBING, manual]**
### Task 8.2 — `Auth0Provider`, login/logout **[PLUMBING]**
### Task 8.3 — Attach the access token to API calls
- **Trap:** `getAccessTokenSilently` is async. An interceptor that forgets to await sends
  `Bearer undefined` → 401 that looks like a configuration problem.
- **Verify:** inspect a real request header.
### Task 8.4 — Backend JWT middleware
- **Verify:** no token → 401, garbage token → 401, valid token → 200. Show all three.
### Task 8.5 — Scope courses to the authenticated user
- **Verify:** two users; user B gets 404 on user A's course id. **Test this explicitly** —
  it is the most likely security hole in the project.

---

# Phase 9 — YouTube videos *(cuttable)*

### Task 9.1 — `GET /api/youtube?query=` backend proxy
- **Trap:** the key must never reach the browser bundle. `VITE_*` vars are public.
### Task 9.2 — Cache results by query
- **Verify:** same query twice → one upstream call.
### Task 9.3 — `VideoBlock` iframe
- **Verify:** force the zero-results path — a message, not an empty grey box.

---

# Phase 10 — Hinglish audio *(cuttable)*

### Task 10.1 — Flatten lesson blocks into narration text
- **Trap:** feeding raw lesson JSON means the narrator reads out `"type": "paragraph"`.
### Task 10.2 — Translate to Hinglish, then synthesize speech
- **Trap:** confirm the audio format you get back. Check the file's magic bytes before
  assuming the browser can play it.
- **Verify:** save it, print the first 4 bytes and the length, then actually listen to it.
### Task 10.3 — `AudioPlayer` with loading state
- **Verify:** a long lesson — report the character count you tested and what happens over it.

---

# Phase 11 — PDF export *(cuttable)*

### Task 11.1 — Off-screen print-styled render target
- **Trap:** `html2canvas` cannot capture `display: none`. Position off-screen instead.
### Task 11.2 — `LessonPDFExporter` — html2canvas → jsPDF, multi-page
- **Verify:** export a lesson long enough to need 3 pages. Open it. Confirm nothing is
  clipped at the seams. Report page count and file size.

---

# Phase 12 — Make it showable *(never cut)*

### Task 12.1 — `README.md`
- Architecture diagram, setup steps, env table, live URL, screenshots.
- **Verify:** follow your own README on a clean clone. Anything you needed to know that
  isn't written down is a README bug.
### Task 12.2 — Final pass on the four journals
- **Verify:** `QUESTIONS.md` has five answered questions per major component, answered from
  this codebase rather than from documentation.
### Task 12.3 — Demo script and 5-minute recording
- Prompt → generation → lesson → MCQ → video → PDF → architecture.
- **Verify:** rehearse against the **live** site, not localhost.
### Task 12.4 — Repo hygiene
- Real commit history, feature branches, no secrets in any commit.
- **Verify:** `git log --oneline` reads like a build, and search the full history for your
  API key.

---

## Verification rules — every task

1. Nothing is "done" until it has been run and reported with numbers.
2. Hostile inputs are part of every verification: empty, malformed, absent, and the failure
   path — including forcing any fallback to actually execute.
3. Stateful things get tested **with** state: the second call, the second user, the warm cache.
4. Confirm the process answering you is the process you just started.
5. Anything that can fail silently gets a log line showing the inputs to the decision.
