# LearnSmith

LearnSmith is a full-stack learning application that turns a topic into an
AI-generated course. Create an outline, generate individual lessons when you
need them, practise with quizzes, and return to your saved progress.

[Live application](https://learn-smith.vercel.app/) ·
[API health endpoint](https://learnsmith-api.onrender.com/api/health)

## What you can do

- Create courses with ordered modules and lessons. Lesson generation uses the
  stored course outline as context and saves content for later reading.
- Track manual lesson completion, continue from your last-opened lesson, and
  revisit server-graded quiz attempts with answer explanations.
- Generate Hinglish narration and find related YouTube videos when those
  integrations are configured. Save lessons as PDF through browser print.
- Try a course as a guest, or sign in through Auth0 to use a private account
  library. Google sign-in and Universal Login use the same ownership rules.
- Subscribe to Pro through Razorpay for higher daily generation allowances.
  Manage renewal and view remaining paid access from Plan & billing.

The interface includes a searchable course library, a dedicated creation page,
course outlines, lesson navigation across modules, and a responsive reader.
Desktop has a course outline beside the lesson; mobile has an outline drawer
and persistent app navigation.

## How it works

1. Enter a topic and create a **course outline** containing modules and lesson titles.
2. Choose a lesson and explicitly select **Generate lesson**. Opening a lesson
   alone does not start paid generation.
3. Read the saved lesson, answer practice questions, and mark it complete when ready.
4. Return through My learning or the course outline. Saved reads and audio replays
   do not use generation allowance.

Guest courses require their saved link and the same browser's signed guest cookie.
My learning lists account courses only. Guest records do not transfer on sign-in;
losing the guest cookie loses access to those records. Continue restores the
last-opened lesson, not a scroll position. Quiz results do not mark lessons complete.

## Stack and structure

| Area | Technologies |
| --- | --- |
| Client | React, React Router, Vite, Tailwind CSS |
| API | Node.js, Express |
| Database | MongoDB, Mongoose |
| AI and media | OpenAI API, YouTube Data API v3 |
| Identity and billing | Auth0, Razorpay |
| Hosting | Vercel client, Render API, MongoDB Atlas |

```text
client/
  src/app/          Lazy-loaded page definitions
  src/layouts/      Public layout and learning workspace
  src/pages/        Route-level screens
  src/features/     Course, lesson, auth, billing and homepage components
  src/components/   Shared reader, quiz, audio, form and usage controls
  src/hooks/        Data fetching and action hooks
  src/lib/          API client, learning state and shared helpers
  src/styles/       Page and workspace styles
  scripts/          Frontend verification scripts
server/
  config/           Environment, quotas, pricing and generation limits
  routes/           API routes and middleware composition
  controllers/      Request handling and ownership checks
  services/         Generation, learning, accounting and subscription logic
  models/           MongoDB schemas and indexes
  middlewares/      Authentication, guest identity, rate limits and errors
  scripts/          Setup and backend verification scripts
```

## Backend design

**Generation and caching.** Outlines and lesson bodies are separate operations.
Structured-output schemas and server validation check AI responses, with bounded
retries. Saved lessons and audio are reused. Lesson prompts include owner-checked,
bounded course context rather than a client-supplied syllabus.

**Concurrent requests.** Lesson and audio generation use database claims,
expiring leases and attempt IDs. Lesson leases renew through a heartbeat;
publication checks prevent an expired worker from overwriting a newer attempt.
The client polls read-only generation status after conflicts or uncertain responses;
polling never starts another generation.

**Usage and accounting.** Atomic daily counters enforce guest, Free and Pro
allowances. Admitted attempts count even if generation later fails. Provider-call
records track available usage and estimated cost; unknown usage remains unknown.
Separate burst limits protect generation and learning writes.

**Identity and ownership.** The server derives ownership from a verified Auth0 JWT
or a signed HttpOnly guest cookie, never a creator field supplied by the browser.
Course, lesson, learning and billing requests check the relevant owner.

**Learning persistence.** Completion and content-generation state are separate.
Quiz attempts are graded against stored questions, saved with a question-version
snapshot, and deduplicated by submission ID. Retakes keep earlier attempts, and
history uses cursor pagination.

**Subscription access.** Razorpay callbacks and webhook signatures are verified
server-side. Access depends on verified paid periods, not a browser success event
or subscription status alone. Webhook events are deduplicated, test/live records
are separate, and cancelling renewal retains remaining verified paid access.

Key configuration lives in [usageLimits.js](server/config/usageLimits.js),
[billing.js](server/config/billing.js), and [modelPricing.js](server/config/modelPricing.js).

## Run locally

### Requirements

- Node.js 20.19+ in the 20.x series, or Node.js 22.12+.
- A MongoDB connection and OpenAI API access for course generation and storage.
- Auth0, YouTube and Razorpay credentials only for the corresponding integrations.

The client and server are separate npm packages; there is no root npm package.

### 1. Install dependencies

From the repository root:

```bash
npm --prefix server ci
npm --prefix client ci
```

### 2. Configure the server

Copy [`.env.example`](.env.example) to `.env` in the repository root. Set:

```dotenv
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
GUEST_COOKIE_SECRET=<a random secret>
MONGO_URI=<your MongoDB connection string>
OPENAI_API_KEY=<your OpenAI API key>
OPENAI_TEXT_MODEL=<a model supported by the structured-output integration>
```

Generate a guest-cookie secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep that secret stable across restarts. The server requires the cookie secret,
OpenAI key and text model at startup. Without MongoDB, database-backed routes
are unavailable even if the process starts.

Optional server settings:

| Variables | Enable |
| --- | --- |
| `OPENAI_TTS_MODEL` | Hinglish narration using the implemented speech workflow |
| `YOUTUBE_API_KEY` | YouTube video lookup |
| `AUTH0_ISSUER`, `AUTH0_AUDIENCE` | JWT verification and account access |
| `RAZORPAY_MODE`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET` | Subscription checkout and synchronization |

`GET /api/health` reports process health, database state and configured features.
It does not verify that every external credential works.

### 3. Configure sign-in

For accounts, create `client/.env`:

```dotenv
VITE_AUTH0_DOMAIN=<your Auth0 tenant domain>
VITE_AUTH0_CLIENT_ID=<your SPA client ID>
VITE_AUTH0_AUDIENCE=<the same API audience used by the server>
```

Configure an Auth0 Single Page Application and API. Add `http://localhost:5173`
to the application's callback, logout and web-origin allowlists. Set the server's
`AUTH0_ISSUER` to the tenant issuer URL and `AUTH0_AUDIENCE` to the API identifier.
Enable the `google-oauth2` connection for the application to use its Google button.
Without Auth0 configuration, guest course creation remains available but the
private account library and subscriptions require sign-in.

All `VITE_*` values are public browser configuration. OpenAI, YouTube, Razorpay
secrets and the guest-cookie secret belong only on the server.

### 4. Start both processes

In one terminal, from the repository root:

```bash
npm --prefix server run dev
```

In another terminal:

```bash
npm --prefix client run dev
```

Open [localhost:5173](http://localhost:5173). The client sends relative `/api`
requests through Vite's proxy to port 5000. If that port changes, update
[`client/vite.config.js`](client/vite.config.js). Restart the relevant process
after changing its environment file.

## Subscription setup

The configured Pro plan is **INR 50/month**, with up to **12 monthly billing cycles**.
Current daily allowances are:

| Identity | Course outlines | Lesson generations | Narrations |
| --- | ---: | ---: | ---: |
| Guest | 1 | 5 | 2 |
| Free account | 3 | 20 | 10 |
| Pro account | 10 | 50 | 20 |

Allowances reset at midnight UTC and do not accumulate. Upgrading keeps today's
usage. Prices and limits shown in the application come from the server.

For development, set `RAZORPAY_MODE=test`, matching test credentials and a webhook
secret of at least 24 characters in the root `.env`. From `server/`:

- `npm run setup:billing` creates a test plan when no plan ID is configured, or
  verifies the configured test plan. It writes the plan ID to the root `.env`;
  it does not create a customer subscription or payment.
- `npm run check:billing` checks configuration and the provider plan without
  creating plans or payments. Restart the server after setup.

Configure Razorpay's subscription-event webhook at
`https://<your-api-host>/api/billing/webhook` using the same mode and secret.
For live payments, use an approved merchant account, `RAZORPAY_MODE=live`, matching
live keys, a live plan and the live webhook configuration. Verify checkout and
webhook delivery with that deployment before accepting customer payments.

## API overview

The API runs at `http://localhost:5000`. These are the main route groups:

| Routes | Purpose |
| --- | --- |
| `GET /api/health`, `POST /api/session`, `GET /api/usage` | Health, guest session and current usage |
| `POST /api/courses/generate`, `GET /api/courses` | Create an outline; list the signed-in owner's courses |
| `GET /api/courses/:id`, `DELETE /api/courses/:id`, `GET /api/courses/:id/progress` | Owned course, deletion and progress |
| `GET /api/lessons/:id`, `POST /api/lessons/:id/generate`, `GET /api/lessons/:id/generation` | Read, explicitly generate and check generation status |
| `GET /api/lessons/:id/audio`, `POST /api/lessons/:id/audio` | Read saved audio or explicitly generate it |
| `GET /api/lessons/:id/learning`, `POST /api/lessons/:id/visit`, `PUT /api/lessons/:id/progress`, `POST /api/lessons/:id/quiz-attempts` | Read activity, record visits, update completion and submit answers |
| `GET /api/billing/plan` and [billing routes](server/routes/billing.js) | Public plan metadata; authenticated subscription management and signature-verified webhooks |

Generation is always an explicit POST. Reads do not initiate AI work. Account
routes use bearer tokens; guest-accessible resources still require their owner cookie.

## Verification

From `client/`:

```bash
npm run build
npm run lint
npm run verify:workspace
npm run verify:courses
npm run verify:usage
npm run verify:reader
npm run verify:generation-watch
npm run verify:learning
npm run verify:sign-in
npm run verify:checkout
```

These verification scripts use fixtures or mocked requests and do not create real
payments or AI calls. Browser review of private fixture states is separate from
testing live authentication and persistence.

Backend checks are listed by `npm run` in `server/`. They cover generation claims,
quotas, accounting, burst limits, audio, learning, course context and billing.
Database integration checks require `TEST_MONGO_URI` and select the separate
`learnsmith_generation_test` database. They create and clean up temporary records;
use a test connection, not production credentials. Provider-dependent checks use
fake providers rather than paid AI or payment operations.

## Deployment and limits

- **Render:** use `server` as the root, install dependencies and start with
  `npm start`. Set the server environment and allowed frontend `CLIENT_ORIGIN`.
- **Vercel:** use `client` as the root. Update the API destination in
  [`client/vercel.json`](client/vercel.json) for your backend. Its SPA rewrite
  must remain after the API rewrite. Changing `VITE_*` settings requires a rebuild.
- **MongoDB Atlas:** allow backend access and configure `MONGO_URI` on the server.

AI content can contain mistakes; the application does not provide source-backed
lessons or certifications. Burst counters are process-local and need a shared
store before running multiple API instances. Guest-cookie limits are not proof
of a unique person. Narration is synchronous, so deployment proxy timeouts may
interrupt long requests even while server work continues. Provider model support
must match the implemented integration; a model-name change alone may not be enough.
Dedicated refund/dispute webhook handling is not implemented.

Public contact information and privacy, terms and refund policies need owner-reviewed
content before publication.


