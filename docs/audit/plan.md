# Babelback migration plan

Audit of `audit/2026-11` (last commit 13bc12a), 2026-11-03. Findings with evidence are in [findings.md](findings.md). This plan uses the decided direction in [BRIEF.md](BRIEF.md): Railway, Postgres on Railway, Inngest for workflows, a UI rewrite, and native mobile clients later.

## 1. Current -> target

| Piece today | Where it lives | Target | Notes |
|---|---|---|---|
| `POST /api/downloads` (start YouTube job) | `app/api/downloads/route.ts` | `POST /v1/jobs/youtube` on the API service, which sends an Inngest event `youtube/ingest.requested` | Validate and normalise the YouTube id on the server. Dedup through a unique index in Postgres. Remove client-chosen limits and country. |
| `GET /api/downloads/[id]` (status, polled) | `app/api/downloads/[id]/route.ts` | `GET /v1/jobs/:id` reads one Postgres row. Optional `GET /v1/jobs/:id/events` (SSE) | The read path makes no Apify or storage calls. Inngest steps write progress. |
| `POST /api/downloads/[id]/callback` (HMAC webhook) | `app/api/downloads/[id]/callback/route.ts` | `delete` | Nothing calls it today. If the Apify actor stays, an Apify webhook becomes an Inngest event that `step.waitForEvent` waits for. |
| `POST /api/song-analysis` | `app/api/song-analysis/route.ts` | `POST /v1/analyses` (asset id, language, model from an allowlist) sends `song/analyze.requested`. The Inngest function calls Gemini and writes an `analyses` row | Gemini gets audio through the Files API, not inline base64. Structured output is validated with the shared zod schema. |
| `POST /api/uploads/audio` (buffers whole body) | `app/api/uploads/audio/route.ts` | `POST /v1/uploads` returns a presigned PUT URL. `POST /v1/uploads/:id/complete` checks the object | The browser uploads straight to storage, so no body limit applies. Enforce a size cap and an audio content-type allowlist. |
| `GET /api/media` (sign any bucket/path) | `app/api/media/route.ts` | `GET /v1/media/:assetId` | Checks ownership or public-seed status, then signs one object the server owns. |
| `GET /api/seeds`, `GET /api/seeds/[cacheKey]` | `app/api/seeds/*`, `data/seed-songs.json` | `GET /v1/seeds`, `GET /v1/seeds/:id` from Postgres (seed songs are `audio_assets` rows with source `seed`) | Import `data/seed-songs.json` once, then delete it. |
| Unserved `app/api/*.ts` (echo, health, proxy, singing-feedback, song-analysis, upload, metrics/debug, uploads/audio) | `app/api/` | `delete` | Port the singing-feedback prompt and response schema into `practice/score` (below). Do not revive `proxy.ts`. |
| Singing feedback (404 today) | `services/geminiService.ts:245` -> nothing | `POST /v1/practice-attempts` (recording uploaded like any asset) sends `practice/score.requested` | New feature in the rewrite. Attempts are stored in Postgres. |
| Redis jobs (`downloads:*`), in-memory job map | `app/api/_lib/jobStore.ts`, `redis.ts`, `downloadJobs.ts` | Postgres `jobs` table plus Inngest run state | `delete` Redis. |
| Redis analysis cache (`analysis:gcs:*`, 30 days) | `app/api/_lib/analysisCache.ts` | Postgres `analyses` table. Unique on (asset, language, model, karaoke, prompt version) | Server-written only, never keyed by client input. |
| Apify accounts and tokens in Redis | `app/api/_lib/apifyAccounts.ts`, `scripts/manage-apify-accs.ts` | Railway env vars (`APIFY_TOKEN`, and a second token only if account rotation is still needed) | |
| Client polling loops (3 copies, 2-4 s) | `app/song-explorer/page.tsx:369`, `useSongExplorerController.ts:101`, `hooks/useDownloadJob.ts:37` | One client hook polling `GET /v1/jobs/:id` with backoff, or SSE | Generated from the shared contract. |
| Downloader: Apify actor | `actors/yt-audio-basic` | Kept, called from an Inngest step (see decision 4.1) | Upload target is a presigned URL to our storage, as today. |
| Downloader: GCP Cloud Function | `gcp/ytdlp-function` | `delete` (undeploy too) | Unused, deployed `--allow-unauthenticated`. |
| Downloader: Python worker | `workers/ytdlp-worker` (3 `.pyc` files) | `delete` | No source. |
| Library (songs + audio blobs + analysis) | Browser IndexedDB `BabelbackLibraryDB` (`db.ts`) | Postgres `library_entries` -> `audio_assets`/`analyses`. Audio in object storage | IndexedDB can stay as an offline cache only. A one-time "import my local library" runs on first sign-in (same origin required, see 3 P2). |
| Practice attempts | IndexedDB `practiceAttempts` | Postgres `practice_attempts`. Recordings in object storage | |
| Media: GCS (`GCS_BUCKET`, seeds in `babelback-dev`) | `app/api/_lib/storage.ts` | S3-compatible bucket (see decision 4.4). Existing GCS objects are copied once | Keep the small storage module. Drop the one-implementation interface. |
| Media: Vercel Blob | `@vercel/blob` import (unused), `app/api/upload.ts` (unserved) | `delete` | |
| Analytics: Vercel Analytics | `App.tsx:2`, `app/song-explorer/page.tsx:975` | `delete` | |
| Analytics: GA4 client (gtag) and server (Measurement Protocol) | `services/analytics.ts`, `app/api/_lib/ga.ts` | Keep GA4. Client events from the web app, server events from Inngest functions on completion or failure | Keeps the existing `docs/analytics-spec.md` event names. |
| Env loading (`dotenv` imported by every route) | `app/api/_lib/loadEnv.ts`, `gemini/index.ts:4` | Railway service variables. `dotenv` for local dev only, loaded once at process start | |
| Hosting: Vercel project | `.vercel/`, `scripts/vercel-env-import.sh` | Railway project: `api` service, `web` service (Next.js), Postgres | `delete` both files after cutover. |
| Web app: Next.js App Router pages | `app/*/page.tsx`, `src/features/*`, `components/*` | New Next.js App Router app in `apps/web`: pages only, data from the Hono API (see section 2), built from the UI inventory | Rewritten in P2, not migrated. |

`docs/TODO.md` against Inngest:

- **Inngest replaces:**
  - the polling worker with `FOR UPDATE SKIP LOCKED` (`TODO.md:22`);
  - the HMAC `yt-complete` webhook and its timestamp checks (`:16-20`, `:31`);
  - the hand-built retries and backoff (`:30`);
  - "chain to analysis job on success" (`:30`), which becomes one function emitting the next event;
  - the whole outbox and event-driven section (`:50-68`).
- **Keep from TODO.md:**
  - Postgres and the `jobs`, `song_analysis` and `song_practice` tables (`:6`);
  - presigned upload URLs (`:9`, `:11`);
  - server-side auth (`:5`) and user scoping on every query (`:45`);
  - rate limits and quotas (`:46`, mostly as Inngest throttle and concurrency keys, with credits in place of a daily quota (decision 4.6));
  - idempotency keys on job creation (`:48`);
  - polling first, SSE later (`:37`).
- **Drop from TODO.md:**
  - NextAuth as the auth layer (cookie-first, tied to Next, weak for native clients);
  - guest limits kept in localStorage (`:8`), which the server must enforce instead;
  - the separate Python FastAPI ingest service (`:25-31`), which an Inngest step calling the Apify actor replaces.

## 2. Backend recommendation

**Recommendation: a standalone Hono API service on Node, deployed on Railway, that also serves the Inngest functions. The web app stays on Next.js, serving pages only, with no route handlers.**

### How the options compare

| Criterion | Next.js route handlers | Hono (standalone) | Express 5 | Fastify 5 |
|---|---|---|---|---|
| Mobile token auth | Possible, but middleware and helpers assume cookies and the browser | Bearer and JWT middleware built in. Auth libraries mount as a handler | Middleware ecosystem, all add-ons | Plugins (`@fastify/jwt`), all add-ons |
| Versioned API | Folder convention (`app/api/v1/...`). No router-level grouping | `app.route('/v1', v1)` | Router mounting | Prefixed plugins |
| One typed contract for web and mobile | Possible through an add-on (ts-rest, oRPC). No OpenAPI out of the box | zod route definitions (`@hono/zod-openapi`) produce OpenAPI for native codegen. `hc<AppType>` gives a typed TS client with no codegen | Third-party zod-to-OpenAPI. Types bolted on | Good: zod type provider plus `@fastify/swagger`. More ceremony |
| Inngest | `inngest/next` adapter | `inngest/hono` adapter | `inngest/express` adapter | `inngest/fastify` adapter |
| Railway | One Node server (`next start`). API deploys with every web change | One small Node service. Web is a separate service | Same as Hono | Same as Hono |
| Uploads, streaming, SSE, long work | Fine on Node (no Vercel body limit on Railway). SSE through a raw `ReadableStream` | Presigned uploads need no body handling. `streamSSE` helper. Long work goes to Inngest | Fine. SSE by hand | Fine. SSE through a plugin |
| One-developer upkeep | Next major upgrades change server APIs (Next 15 made `cookies()` async, and `app/layout.tsx:19` still uses it the sync way). The server React surface brings its own CVEs (`next@15.2.4` has critical advisories today) | Small, few dependencies, Web-standard `Request`/`Response` | Familiar, but types, validation and OpenAPI are separate packages to keep in step | Fast and solid, but the most concepts (plugins, encapsulation, hooks) |
| Cost of moving current code | Lowest on paper, but nearly all route code is replaced anyway | Low. Handlers already use Web `Request`/`Response`, so they port almost line for line | Medium (different req/res model) | Medium |

### Why Hono

- **Mobile first.** Native apps need bearer tokens, a stable `/v1` and a contract they can generate a client from. Hono gives all three with little code: zod route definitions publish `/v1/openapi.json` for Swift and Kotlin codegen, and the same definitions give web (and React Native, if chosen) a typed client through `hc`. Next can be made to do this, but every piece is an add-on bolted onto a framework built for rendering pages.
- **The move is cheap whichever framework wins.** The live server code is 8 route handlers (about 1,200 lines) plus `_lib` (about 1,400 lines). The migration replaces most of it: jobs, cache, polling and uploads. What ports over is `prompts.ts`, `verseParser.ts`, the storage signing, the Gemini client and request parsing. None of these depend on Next. They only use `NextRequest`/`NextResponse` as thin wrappers over Web `Request`/`Response`, which Hono uses natively.
- **It separates two release cycles.** Mobile apps pin to API versions for months. Keeping the API in its own service means a web redesign never redeploys or risks the API, and the reverse.
- **It suits one developer.** One small dependency, no build-time framework magic, and the same code runs locally with `node`.
- **Earlier intent matches.** The Apify actor's design notes already assume a Hono caller (`actors/yt-audio-basic/main.js:9-13`).

### Deployment shape

- **Railway services:**
  - `api`: Hono on `@hono/node-server`. It serves `/v1/*`, the auth routes and `/api/inngest`.
  - `web`: Next.js (`next start`). Pages only, no route handlers.
  - `Postgres`.
  - No Redis.
- **Inngest:** Inngest Cloud calls `api` over HTTP to run steps. Start with one service. If long Gemini steps start to compete with API latency, run the same image a second time as `worker` with only the Inngest route enabled. That is a start-command change, not a rewrite. Inngest's outbound `connect` mode is the other option.
- **Long work:** Gemini analysis and downloads never run in the request path. The API sends an event, returns `202` with a job id, and the client polls `GET /v1/jobs/:id` (SSE later). Inngest retries each step and marks the job failed when it runs out of retries. Keep each step well under Railway's HTTP request timeout (exact limit `unverified`). Return ids from steps and write large results to Postgres instead of returning them.
- **Uploads and streaming:** both go straight between the client and storage through presigned URLs. The API never proxies audio bytes.
- **Domains:** put `api` and `web` on the same site (for example `babelback.app` and `api.babelback.app`). Web can then use HTTP-only cookie sessions and native apps use bearer tokens on the same endpoints. Serve the new web app on the current production origin, so the browser lets it read the old IndexedDB library for the one-time import.

### Web frontend: stay on Next.js

Stay on Next.js (App Router), as a new pages-only app in `apps/web` that calls the Hono API through the typed `hc` client. A single-page app was considered and rejected by the owner on 2026-11-03 as too cumbersome.

- **No route handlers.** All data goes through `/v1` on the API, so web and native apps share one set of endpoints and one contract. Next renders pages and nothing else.
- **Client components for the interactive screens.** Playback, recording, device selection and verse sync run in the browser, as they do today.
- **Server rendering where it pays.** The landing and about pages now, and public shareable song pages if they become a goal.
- **Auth stays in the API.** Web and API share a site, so the HTTP-only session cookie reaches both. Server components forward it when they fetch from the API.
- **Cost.** Next is still a second server to patch and upgrade. P0 already moves it past the critical advisories, and keeping it to pages limits what an upgrade can break.

## 3. Backlog

Each item ends with when it is done. Severity and evidence for each item are in `findings.md`.

### P0: cleanup on the current app (days)

The current app stays in production on Vercel until P2 cutover, so P0 keeps it honest and cheap to run. P0 adds no new features.

1. **Delete dead code.**
   - The unserved `app/api/{echo,health,proxy,singing-feedback,song-analysis,upload}.ts`, `app/api/metrics/debug.ts` and `app/api/uploads/audio.ts`. Keep the singing-feedback prompt and schema in git history for P1.
   - `app/api/_lib/{telemetry,downloadJobs}.ts`, `index.tsx`, `index.css`, `services/{prompts,verseParser}.ts`, and the unreachable components and hooks listed in findings.
   - The 45 unreachable `components/ui/*` files.
   - The `/api/proxy` fallback in `services/geminiService.ts:187-213` and the unused `@vercel/blob` import.
   - `components/EchoTester.tsx` and its mount in `components/TechDetailsPage.tsx:91`. It only calls the dead `/api/echo`.
   - The callback route `app/api/downloads/[id]/callback/route.ts`. It has no producer and is unauthenticated when `CALLBACK_SECRET` is unset.
   - Done when the build route table lists no callback route and `rg NextApiRequest app` is empty.
2. **Delete junk.**
   - `dist/`, `.vercel/`, `backups/`, `workers/ytdlp-worker/`, `gcp/ytdlp-function/`, `log.txt`.
   - The unreferenced PNGs (`bb-logo.png`, `ssbb.png`, `public/images/design-mode/bb-logo.png`, `public/placeholder*`), about 2.4 MB.
   - The ignored `tailwind.config.js`, `src/index.css` and `styles/globals.css` (check each is truly unused first).
   - Done when `git ls-files` shows none of them and `.gitignore` covers `dist/`, `.vercel/` and `__pycache__/`.
3. **Undeploy the GCP Cloud Function** if it is still deployed (`gcloud functions list`).
   - Set spend caps with no code change: a Gemini API key quota, an Apify monthly usage limit and a GCP budget alert.
   - Done when the function URL returns 404 and all three caps exist.
4. **Close the open signing oracle** in `app/api/media/route.ts`.
   - Allow only `GCS_BUCKET` and the seed bucket, and only the `downloads/`, `uploads/` and seed path prefixes.
   - Cap expiry at 2 h. Remove `mode=download` once the seed screen can stream from the signed URL.
   - This is the one security fix worth making on code that P1 replaces. The endpoint lets anyone read any object the service account can see, for 7 days.
   - Done when a request for another bucket returns 400.
5. **Pin dependencies.**
   - Pin `@radix-ui/react-slider` and `@vercel/analytics` to exact versions instead of `latest`.
   - Bump `next` to the patched 15.5.x for the critical RCE advisories.
   - Remove the unused dependencies listed in findings.
   - Done when `npm audit --omit=dev` shows no critical advisories and `package.json` has no `latest`.
6. **Get tsc, lint and build honest.**
   - Remove `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` from `next.config.mjs`.
   - Add an ESLint flat config and replace the deprecated `next lint` script.
   - Fix the type errors that remain after items 1-2. This includes the live Gemini call bugs in `app/api/song-analysis/route.ts` (`:99`, `:106`, `:142`, `:337`), which also fix karaoke segments and the "Translation to undefined" fallback text.
   - Done when `npx tsc --noEmit`, `npm run lint` and `npm run build` all exit 0 with the flags removed.
7. **Get tests green.**
   - Delete the 4 stale `BasicView`/`AdvancedView` tests that assert the old +/-2-verse window. The UI they cover is rewritten in P2.
   - Done when `npm test` exits 0.

### P1: backend on Railway (weeks)

Build the new backend beside the old app. Nothing user-facing switches until P2.

1. **Repo layout.** npm workspaces: `apps/api` (Hono), `apps/web` (P2), `packages/contract` (zod schemas, inferred types, API client). Done when `apps/api` serves `GET /v1/health` locally.
2. **Railway project.** `api` and `web` services, Postgres and a bucket, in one production environment. No staging (decided 2026-11-05): keep it simple. Env vars by name: `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL_ID`, `APIFY_TOKEN`, `APIFY_ACTOR_ID`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, storage credentials, auth secret, `GA_MEASUREMENT_ID`, `GA_API_SECRET`. Done when production deploys and `/v1/health` checks the database.
3. **Schema (Drizzle) and migrations.** Anyone who triggers paid work is a signed-in `users` row, so every table keys on the user the same way.
   - **`users`:** id is the Clerk user id (decision 4.5), plus `credit_balance integer not null default 0 check (credit_balance >= 0)`. Clerk keeps sessions and accounts, so there are no session tables.
   - **`audio_assets`:** owner (set for uploads, null for YouTube and seed audio), source (`upload`, `youtube`, `seed`), `youtube_id`, title, artist, storage key, content type, bytes, `duration_ms`. Unique on `youtube_id`, so each video is downloaded once and shared by everyone who adds it. Title and artist live here, which removes the separate `songs` table.
   - **`analyses`:** asset, language, model, karaoke, prompt_version, `result jsonb` (the zod `SongData`). Unique on (asset, language, model, karaoke, prompt_version). Analyses are shared too: the second person to add a song reads the existing row.
   - **`library_entries`:** user, asset, preferred language, created and last-opened times. Unique on (user, asset). A user can read an asset or its analyses only through their own library entry, or when it is a seed.
   - **`jobs`:** user, type (`youtube_ingest`, `analyze`, `practice_score`), status (`queued`, `running`, `succeeded`, `failed`), progress, error code and user-safe message, input `jsonb`, result ids, Inngest run id, unique idempotency key. Partial unique index on (user, youtube_id) while queued or running, so a double click starts one job.
   - **`practice_attempts`:** user, asset, analysis, verse range, recording storage key, status, `score jsonb` (the zod `SingingScore`).
   - **`credit_ledger`:** user, delta (positive for grants and refunds, negative for spends), reason (`signup_grant`, `trial_grant`, `purchase`, `spend`, `refund`, `admin`), job id, payment event id, created time. Unique on (job, reason), so a job is charged once and refunded at most once. Unique on payment event id, so a replayed webhook never grants twice.
   - Done when migrations run on deploy and the seed import has loaded the 3 seeds.
4. **Auth and credits** (decisions 4.5 and 4.6).
   - Cookie sessions for web and bearer tokens for native, on the same `/v1` routes.
   - Every query is scoped by user. Credits limit paid work. Per-user Inngest throttle and concurrency keys stop bursts. There is no separate daily quota.
   - Done when an unauthenticated `POST /v1/jobs/youtube` returns 401, a second user cannot read the first user's job or media, and a user without enough credits gets 402 and no job.
5. **Storage** (decision 4.4).
   - Presigned PUT with a size cap and an audio content-type allowlist.
   - `POST /v1/uploads/:id/complete` checks the object's size and type.
   - `GET /v1/media/:assetId` signs only assets the caller owns or public seeds.
   - Copy the GCS objects still in use once.
   - Done when a 30 MB upload works end to end and a foreign asset id returns 404.
6. **Shared contract.**
   - The one zod `SongData`/`Verse`/`SingingScore` schema replaces `types.ts:22-39`, the route-local `SongData`, `verseParser.ts`'s `Verse` and the two `Language` enums.
   - It doubles as the Gemini `responseSchema` source and the API response types.
   - zod is the only source of truth. `/v1/openapi.json` is generated from the zod route definitions by a script and committed. Nobody edits it by hand.
   - Web imports the route types through `hc<AppType>`, with no generation step. A contract change that breaks web fails `tsc` in the same PR.
   - CI regenerates `openapi.json` and fails on any diff, so native codegen never reads a stale spec.
   - Once a native app ships, add a breaking-change check (`oasdiff breaking`) against the last released spec. Breaking changes then go to `/v2`.
   - Done when the web client and a sample codegen both build from it, and a route change made without regenerating fails CI.
7. **Inngest functions**, each with retries and an `onFailure` handler that marks the job failed with a user-safe message:
   - `youtube/ingest`: normalise the URL to a video id, dedup, then start the Apify run with server-side caps. Wait for the Apify webhook event (or poll with `step.sleep`), check the object, create the `audio_assets` row and emit `audio/ready`.
   - `song/analyze`: upload to the Gemini Files API, then call with `responseMimeType: application/json` and a `responseSchema`. Validate with zod and write `analyses`. Uses the fixed prompt call signatures.
   - `practice/score`: port the singing-feedback prompt and schema from git history.
   - Use Inngest `concurrency` and `throttle` keyed by user id to cap spend.
   - Done when a YouTube link goes from request to stored analysis in production with the Inngest dashboard showing each step.
8. **API v1 endpoints:**
   - `POST /v1/uploads`, `POST /v1/uploads/:id/complete`;
   - `POST /v1/jobs/youtube`, `GET /v1/jobs/:id` (SSE later);
   - `POST /v1/analyses`, `GET /v1/analyses/:id`;
   - `GET /v1/library`, `POST /v1/library`, `DELETE /v1/library/:id`;
   - `GET /v1/media/:assetId`;
   - `POST /v1/practice-attempts`, `GET /v1/practice-attempts`;
   - `GET /v1/seeds`, `GET /v1/seeds/:id`.
   - Model ids come from a server allowlist.
   - Done when an integration test per endpoint passes against a test database.
9. **Minimum observability.** JSON logs with job id and user id on every line, an Inngest failure alert, and Railway health checks. Done when a forced Gemini failure shows up as a failed job, a log line and an alert.

### P2: UI rewrite (weeks)

1. **Design from the inventory** (Appendix B).
   - Screens: home, sign-in, explorer setup (upload, YouTube or seed), song view (basic, advanced, snapshot), library, practice, about.
   - Every job state: queued, downloading, analysing, failed with retry, too long, too large.
   - Permission states (microphone, earphones) and empty states.
   - Mobile-first, because the native apps will mirror it.
   - Done when the flows are reviewed and agreed.
2. **Web scaffold.** `apps/web` on the Next.js App Router with the contract client and auth screens, deployed as the Railway `web` service. Done when sign-in and the seed flow work in production.
3. **Build the screens** in this order: seed song (no upload, fastest path to the player), upload, YouTube with job progress, library, language switch (new `analyses` row on the same asset), practice. Done when every flow in Appendix B works in production.
4. **Local library import.** On first sign-in on the production origin, read the old `BabelbackLibraryDB`. Upload entries that have audio, and skip and report the 0-byte ones. Done when an exported test library imports without loss.
5. **Cutover.**
   - Point the production domain at Railway `web` and `api`.
   - Delete the old root Next.js app, `app/api`, Redis, Vercel KV, Vercel Blob and the Vercel project.
   - Done when nothing in the repo or the provider consoles references Vercel or Redis.

## 4. Open decisions

### 4.1 YouTube downloads: Railway datacenter IPs or Apify's residential proxy

**Recommendation: keep the Apify actor on residential proxies for launch, called from the `youtube/ingest` Inngest step. Run a short measured trial of yt-dlp from Railway before deciding to drop Apify.**

- YouTube rate-limits and bot-checks datacenter IP ranges hard. Even on the residential proxy the actor gets 403s: it retries once without the proxy when yt-dlp returns 403 (`actors/yt-audio-basic/main.js:165-170`). Datacenter IPs will see more of them, so measure before switching.
- Running yt-dlp on Railway would mean keeping up with yt-dlp releases, cookies and PO-token workarounds. That is ongoing upkeep for one developer.
- Apify costs per run plus residential bandwidth. The server-side caps on duration and size (which the client can override today) bound that cost.
- Trial: download about 50 recent, varied videos from a Railway service. Switch only if the success rate matches the actor and the saving is worth the upkeep.

### 4.2 Inngest Cloud or self-hosted

**Recommendation: Inngest Cloud.**

- Self-hosting means running the Inngest server and its own state stores, then monitoring and upgrading them. That brings back the Redis this plan deletes, plus a service to babysit.
- Cloud gives the run dashboard, replay and alerts for free. Current volume should fit the free tier (check the current limits before committing).
- Use the Inngest dev server locally.
- Keep step outputs small (ids, not audio or full lyrics) so payload limits and data residency stay a non-issue.

### 4.3 Drizzle or Prisma

**Recommendation: Drizzle.**

- The schema is TypeScript, so there is no separate schema language and no generate step.
- `drizzle-zod` turns tables into zod schemas that feed the shared contract directly.
- Queries stay close to SQL, which makes the unique-index dedup and the `FOR UPDATE` cases plain.
- It runs on the plain Postgres driver with no extra engine.
- Prisma's strengths (migration UX, Studio) matter less for a schema of about 8 tables. Its schema file would be a second source of truth next to zod.

### 4.4 GCS or S3-compatible storage

**Decided (2026-11-03): a Railway bucket (`audio`, region `sin`), with a one-time copy of the GCS objects still in use.**

- Railway bucket egress and S3 operations are free, and storage costs $0.015 per GB a month. Audio is streamed again and again on playback, so free egress decides it.
- Presigned URLs work. Public buckets do not exist, so every read goes through a URL the API signs.
- The api service reads `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` as references to the bucket.

### 4.5 Auth

**Decided (2026-11-04): Clerk.**

- **Sign-in methods:** Clerk's email code and Google. Turn on Sign in with Apple before the iOS app ships, because Apple requires it alongside other social sign-ins.
- **Sessions:** web uses Clerk's Next.js SDK. Native apps use Clerk's iOS, Android or Expo SDKs. Both send the Clerk session token, and the API verifies it on the same `/v1` routes with `@clerk/backend`.
- **Users table:** our `users` row is keyed by the Clerk user id and holds `credit_balance`. A Clerk `user.created` webhook (Svix-signed) creates the row and writes the sign-up grant once.
- **Trade-offs accepted:** per-user pricing after the free tier, and user records living at Clerk. In return there is no auth code to maintain, and the native SDKs are ready.
- **Logged-out use:**
  - Browsing and playing the seed songs needs no session. Seeds are analysed at import, so serving them costs nothing.
  - **Recommendation: no anonymous trial.** Clerk has no anonymous users, so a trial would need our own guest accounts, a per-IP cap and a merge on sign-up. Anything that costs credits needs sign-in instead. The sign-up grant covers the first songs. If this is accepted, remove `trialGrantCredits` and `anonymousUsersPerIpPerDay` from the settings page.
- **Env vars:** `CLERK_SECRET_KEY` (api and web), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (web), `CLERK_WEBHOOK_SIGNING_SECRET` (api).

### 4.6 Credits

**Recommendation: one integer credit balance per user, a flat price per action, and a ledger row for every change. Launch with free grants only, and add purchases when you start charging.**

- **Prices.** These are placeholders. Set them from the measured cost per action before launch, because the Gemini and Apify cost per song is `unverified`.

  | Action | Credits |
  |---|---|
  | Play a seed song, or open a song already in your library | 0 |
  | Score a practice attempt | 1 |
  | Analyse an uploaded song, or add a language to a song | 5 |
  | Add a YouTube song (download and analysis) | 8 |

- **Flat, not metered.** The price shows before the user confirms. It does not depend on song length (the 10-minute cap bounds the cost) or on whether the analysis was already cached, so users can predict it. The server picks the Gemini model, so there is no price per model.
- **Grants.** Sign-up gets 40 credits, about five songs. The anonymous trial grant is dropped with Clerk (decision 4.5). There is no monthly top-up at launch. Add one if retention needs it.
- **Charging.**
  - One transaction writes the `spend` row, lowers `credit_balance` and creates the job.
  - The `check (credit_balance >= 0)` constraint rejects an overdraw, and the API returns 402.
  - Inngest's `onFailure` handler writes the `refund` row. The (job, reason) unique index means a retry never refunds twice.
  - Adding a song that is already in your library costs nothing.
- **Purchases (later).** Sell credit packs, not subscriptions.
  - A payment webhook writes a `purchase` row. The ledger doesn't care which provider sent it.
  - Use Stripe Checkout on the web.
  - In the iOS and Android apps, credits count as digital goods, so store rules generally require in-app purchase. The rules vary by storefront and are changing, so check them before the native launch.
  - RevenueCat can send purchases from both stores to the same webhook.
- **Expiry.** None at launch. If free grants ever expire, purchased credits still never do.
- **Why credits rather than a daily quota.** One mechanism covers free accounts and paid packs, and the numbers map to what each action really costs.

## Appendix A: current system map

### Routes

| Route | File | Status | Caller |
|---|---|---|---|
| `POST /api/downloads` | `app/api/downloads/route.ts` | live | `services/downloadsService.ts:31` via `app/song-explorer/page.tsx:366`, `useSongExplorerController.ts:99`, `hooks/useDownloadJob.ts:62` (unreachable) |
| `GET /api/downloads/[id]` | `app/api/downloads/[id]/route.ts` | live | the same pollers (every 4 s, 4 s, 2 s) |
| `POST /api/downloads/[id]/callback` | `app/api/downloads/[id]/callback/route.ts` | live, no producer | none. The actor is never given `callbackUrl` |
| `POST /api/song-analysis` | `app/api/song-analysis/route.ts` | live | `services/geminiService.ts:108,137,182,200` |
| `POST /api/uploads/audio` | `app/api/uploads/audio/route.ts` | live | `services/geminiService.ts:82` |
| `GET /api/media` | `app/api/media/route.ts` | live | `useSongExplorerController.ts:135` (seed audio, `mode=download`) |
| `GET /api/seeds` | `app/api/seeds/route.ts` | live, unused | only `components/SeedLibraryView.tsx` (not mounted) |
| `GET /api/seeds/[cacheKey]` | `app/api/seeds/[cacheKey]/route.ts` | live | `useSongExplorerController.ts:231` |
| `/api/singing-feedback` | `app/api/singing-feedback.ts` | dead, still called | `services/geminiService.ts:245` (404) |
| `/api/proxy` | `app/api/proxy.ts` | dead, still called | `services/geminiService.ts:193` (404) |
| `/api/echo` | `app/api/echo.ts` | dead, still called | `components/EchoTester.tsx:38,75` (404) |
| `/api/song-analysis` (old copy) | `app/api/song-analysis.ts` | dead, duplicate | none |
| `/api/upload`, `/api/health`, `/api/metrics/debug`, `/api/uploads/audio` (old copy) | `app/api/upload.ts`, `health.ts`, `metrics/debug.ts`, `uploads/audio.ts` | dead | none |

Pages:

- `/`, the landing page, with seed cards from `data/seed-songs.json`.
- `/song-explorer/responsive`, the linked main app.
- `/song-explorer`, the legacy all-in-one page. It is unlinked and is the only page with practice mode.
- `/library` and `/about`.

### Data stores

| Data | Store | Key | Lifetime |
|---|---|---|---|
| Download jobs | Redis, else Vercel KV REST, else per-instance memory | `downloads:{jobId}`, `downloads:src:{sha1(url)}` | 48 h (`JOBS_TTL_SECONDS`) |
| Song analyses (the only server copy) | Redis | `analysis:gcs:{sha1(bucket/path)}:{lang}:{model}:{karaoke}` | 30 days (seeds: no expiry) |
| Apify accounts and tokens | Redis | `apify:accounts` (`APIFY_ACCOUNTS_REDIS_KEY`) | none |
| Downloaded audio | GCS `GCS_BUCKET` | `downloads/{jobId}.{m4a,mp3}` | never deleted |
| Uploaded audio | GCS `GCS_BUCKET` | `uploads/{uuid}-{name}` | never deleted |
| Seed audio and analyses | GCS `babelback-dev` and `data/seed-songs.json` | per seed | permanent |
| Library (songs, audio blobs, analysis) | IndexedDB `BabelbackLibraryDB` v3, store `songs` | per browser | until storage is cleared |
| Practice attempts | IndexedDB store `practiceAttempts` | per browser | until storage is cleared |

### External services

- Gemini (`@google/genai`).
- Apify: actor or task per account, on the residential proxy.
- GCS: v4 signed URLs, 2 h for reads and 30 min for writes.
- Redis, with Vercel KV REST as a fallback.
- Vercel Blob: imported but unused.
- GA4 and Vercel Analytics.
- Unused but deployable: the GCP Cloud Function `gcp/ytdlp-function`.

### Env vars (names only)

- Gemini: `GEMINI_API_KEY` (fallback `API_KEY`), `GEMINI_MODEL_ID`, `GEMINI_DEFAULT_MODEL_ID`.
- GCS: `GCS_BUCKET`, plus either `GCP_SERVICE_ACCOUNT_KEY` or `GCP_PROJECT_ID` + `GCP_CLIENT_EMAIL` + `GCP_PRIVATE_KEY`.
- Redis and KV: `REDIS_KV_REDIS_URL`, `REDIS_DISABLE`, `REDIS_CONNECT_TIMEOUT_MS`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `JOBS_TTL_SECONDS`.
- Apify: `APIFY_TOKEN`, `APIFY_ACTOR_ID`, `APIFY_ACCOUNT_LABEL`, `APIFY_ACCOUNTS_REDIS_KEY`, `APIFY_ACCOUNTS_CACHE_MS`, `APIFY_ACCOUNTS_JSON` (scripts only), `APIFY_PROXY_COUNTRY`, `APIFY_MAX_DURATION_SECONDS`.
- Apify size cap: `APIFY_MAX_FILE_SIZE_BYTES`, also read under the misspelled `APIFY_MAX_FILESIZE_BYTES`.
- Callback: `CALLBACK_SECRET`.
- Analytics: `GA_MEASUREMENT_ID` or `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA_API_SECRET`, `GA_DEBUG`.
- Debug flags: `BB_DEBUG`, `BB_DEBUG_DEFAULT`, `NEXT_PUBLIC_BB_DEBUG`, `NEXT_PUBLIC_BB_DEBUG_DEFAULT`.
- Implicit: `BLOB_READ_WRITE_TOKEN`. Cloud Function only: `BUCKET_NAME`.

No secret values are in tracked files. A pattern scan for Gemini keys, private keys, Apify tokens and Redis URLs with passwords found nothing.

Auth: none. There is no `middleware.ts`, no session and no API key on any route.

## Appendix B: UI inventory (for the rewrite)

This inventory comes from the pages, hooks, `db.ts` and `docs/migration-status.md`. Component code was not reviewed.

**Screens (linked)**

- **Home** `/`:
  - Hero with links to Explorer, Library and About.
  - "Try these" cards built from `data/seed-songs.json` (3 seeds), each showing the title, original and target language, and the first verse's meaning.
  - Each card opens `/song-explorer/responsive?seed=<id>`.
- **About** `/about`: static product explainer.
- **Library** `/library`:
  - Lists the songs saved in browser IndexedDB.
  - Open (to `/song-explorer/responsive?libraryId=<id>`) and delete.
  - Empty state points to Explorer.
- **Explorer** `/song-explorer/responsive` (the main app):
  - Setup: source switch ("Upload File" or "YouTube Link"), target language (English, Hindi, Tamil, Telugu or Bengali), an optional model picker, and submit.
  - Setup states: busy messages, an error state and a missing-API-key state.
  - Song view, Basic tab: verse list with the active verse highlighted. Tap a verse to seek.
  - Song view, Advanced tab: the original text of each verse, plus toggles for transliteration, translation and meaning.
  - Song view, Snapshot tab: title and summary.
  - Verse sheet: tap a verse for its full detail.
  - Player footer: play and pause, seek, and an active verse that follows playback.
  - Seed loading screen with a buffering percentage.

**Screens (unlinked, reachable by URL)**

- **Legacy explorer** `/song-explorer`, the old all-in-one page:
  - Practice mode: earphone consent, input and output device picker, and recording one or more verses. Then review, and submit for an AI score with per-verse pronunciation, timing and clarity scores and feedback. Attempts are saved to IndexedDB. Scoring is broken (404).
  - Library sheet.
  - Display-mode toggle and volume.
  - About, Tech details and Changelog sub-pages.

**Flows**

1. Upload file: upload to `/api/uploads/audio`, then analyse by URL, then save to IndexedDB with the audio blob.
2. YouTube link: start a job, poll for up to 15 minutes, then analyse the downloaded object. The linked explorer does not save YouTube songs to the library. The legacy page saves them with a 0-byte audio blob.
3. Seed: load the seed, stream its audio, show the cached analysis and save it to the library.
4. Library reopen: load the entry and its audio blob from IndexedDB.
5. Practice (legacy page only, broken): consent, pick devices, record, score and save the attempt.
6. Changing the target language on a loaded song re-runs analysis on the same audio.

**Features and settings**

- 5 target languages.
- Model choice, with an env default.
- Karaoke word timing: built, but unreachable from the UI and broken on the server.
- Debug mode: the `bb_debug` cookie, `localStorage['bb:debug']` or the `BB_DEBUG*` env vars.

**Edge cases the rewrite must handle**

- Long or failed YouTube downloads, and media that is too long or too large.
- Gemini returning no candidates, non-JSON or missing verses.
- Verses with missing segment timing.
- A missing `Content-Length`, which leaves the buffering percentage stuck at 0.
- Object URLs that are never revoked.
- Microphone or earphone permission denied.
- Large uploads.
- A library that today is per browser, lost when storage is cleared, with no accounts or sync. Import it once (P2 item 4).
