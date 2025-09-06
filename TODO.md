# TODO

## Phase 1 — Backend migration (Next.js + NextAuth)
- Choose runtime/target: Next.js App Router (Node runtime) with Route Handlers.
- Add NextAuth with Prisma Adapter and Postgres (self‑hosted or any provider).
- Define Prisma schema: NextAuth models (User, Account, Session, VerificationToken) + app tables (prompts, jobs, song_analysis, song_practice).
- Implement auth session helpers (`getServerSession`) and API middleware for protection.
- Guest mode (no login): allow up to 3 uploads client‑side using localStorage counter; disable practice/YouTube in guest; show CTA to sign in after limit; add TODO to enforce on server later.
- Storage provider: pick S3‑compatible (AWS S3, R2, or MinIO) and env config; generate pre‑signed PUT URLs.
- Add API routes:
  - `POST /api/uploads/audio/init` and `/api/uploads/practice/init` (pre‑signed URLs)
  - `POST /api/jobs/analysis`, `/api/jobs/youtube`, `/api/jobs/practice`
  - `GET /api/jobs/:id`, lists (optional v1)
  - `GET /api/analysis/:id`, `/api/analysis` (list)
  - `GET /api/practice/:id`, `/api/practice` (list)
  - `POST /api/webhooks/yt-complete` (HMAC verification)
    - Verify HMAC-SHA256 signature + timestamp skew window
    - Idempotent handling (ignore terminal jobs), dedup child analysis job
    - On success: attach metadata to `jobs.output`, enqueue `analysis` job
    - Structured logs + metrics; keep handler fast, offload heavy work
- Extract AI logic from FE into server modules (Gemini SDK, prompts, parsing, normalization).
- Add a worker process (Node script) for polling `jobs` with `FOR UPDATE SKIP LOCKED` to run analysis/practice tasks.
- Document env: NEXTAUTH_SECRET, DB URL, S3 creds, Gemini API key, webhook secret.

## Phase 2 — YouTube ingestion (Python FastAPI)
- Define `yt_ingest` job contract (input: youtube_url, options; output: object_key, youtube_id, title).
- Implement FastAPI worker to poll jobs or receive enqueue webhooks.
- Use yt‑dlp + ffmpeg to normalize (mono/48k Opus or 16k WAV).
- Upload to S3; update job via DB write or call `/api/webhooks/yt-complete` with HMAC.
- Chain to `analysis` job on success; apply retries/backoff on failures.
- Webhook client: sign payload with HMAC (secret + `${timestamp}.${body}`), include `X-Timestamp`/`X-Signature`, retry non‑2xx with backoff; log jobId and response.

## Phase 3 — Client integration
- Replace FE calls with Next.js API endpoints; add TanStack Query for server state.
- Keep local UI prefs in a tiny Zustand store (model selection, panel visibility, modals) with persistence.
- Migrate device/media hooks; keep refs + imperative code local to hooks.
- Job progress: start with polling; evaluate Realtime later (Pusher/Ably or Postgres NOTIFY).

## Phase 4 — XState for complex UI flows
- Introduce XState for Practice flow (consent → permission → ready → recording → review → scoring → score → error).
- Optional machines for upload/analysis and job progress.
- Add unit tests for transition guards and side‑effects.

## Phase 5 — Hardening & Ops
- RLS‑like authorization via app‑level checks (user_id scoping) on all queries.
- Rate limiting (Redis or DB sliding window) and quotas by plan tier.
- Observability: structured logs, Sentry, metrics for job durations and failures.
- Caching/dedup: audio hash + youtube_id param set; idempotency keys on job creation.

## Future Considerations — Event‑Driven Architecture
- Approach: Start with a Postgres Outbox Pattern
  - `events` table writes in the same transaction as state changes (e.g., job created/updated).
  - Small publisher worker polls `events where status='pending' for update skip locked`, publishes to in‑process consumers; later swap to SNS/SQS/Redis without changing producers.
  - Consumers subscribe to event types (`job.created.analysis`, `yt_ingest.completed`, `analysis.completed`, `practice.scored`) and must be idempotent.
- Pros
  - Decoupling: Python ingest, analysis/scoring workers, and API evolve independently.
  - Reliability: Retries, DLQs, and replay improve robustness for flaky steps.
  - Extensibility: Add features (notifications, analytics, billing) without touching producers.
  - Auditability: Durable trail of “what happened” across jobs/users.
- Cons
  - Complexity: Event schemas, idempotency, DLQs, and ordering to manage.
  - Observability: Need correlation/causation IDs, tracing, and metrics.
  - Consistency: Eventual consistency; UI must tolerate intermediate states.
  - Ops overhead: A publisher/queue to run and monitor (even with outbox).
- With the current approach (direct API + jobs):
  - Simpler to ship v1 quickly; fewer moving parts; easier debugging.
  - Tighter coupling across components; adding new side effects requires code changes in producers.
  - Limited fan‑out and replay; retries handled per job, not per event.

## Decisions
- Auth: NextAuth (not tied to Supabase). Providers: Email magic link + Google/GitHub initially.
- DB: Postgres via Prisma (portable across providers).
- Storage: S3‑compatible bucket (portable), signed URLs from server.
- Realtime (later): avoid provider lock‑in; evaluate generic pub/sub or polling.

## Acceptance criteria for Phase 1
- Sign in/out works; `GET /api/auth/me` returns user.
- Signed upload URL issuance works for audio and practice blobs.
- Job creation endpoints exist and are protected.
- Worker can claim and process a sample `analysis` job (stub Gemini call ok for first pass).
- Minimal FE can authenticate and submit an upload + analysis job and read status.
