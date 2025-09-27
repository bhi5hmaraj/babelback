# Babelback: Design

## v1 Draft

This document lays out a pragmatic v1 design to move AI and heavy logic to the backend, add auth/users, and introduce a reliable YouTube ingestion pipeline powered by a Python FastAPI service with yt-dlp and Supabase Storage. It also defines a jobs system in Postgres, server-side persistence of analysis/practice results, and a thin, secure frontend.

### Goals & Scope
- Backendify: Move Gemini calls, parsing, and persistence from the frontend to Hono.
- Auth + users: Secure, multi-tenant model with per-user quotas and storage isolation.
- Ingestion: Direct-to-storage uploads + YouTube URL processing (yt-dlp) with normalized audio.
- Jobs: Durable, retryable job records in Postgres with progress and error details.
- Persistence: Store media in Supabase Storage and metadata/results in Postgres.
- Entities: users, prompts, song_analysis, song_practice, jobs.

---

### Architecture Overview
- Frontend (React): Thin client. Auth, upload/initiation, progress UI, reads results. No secrets.
- API (Hono on Node runtime):
  - Auth verification, signed upload URLs, job creation, AI orchestration, results APIs.
  - Uses `@google/genai` server-side; persists to Postgres and Supabase.
- Python Ingest (FastAPI):
  - Executes YouTube ingest jobs via yt-dlp, normalizes audio, uploads to Storage, updates job or calls back Hono via signed webhook.
- Postgres (Supabase): Job queue + metadata/results.
- Storage (Supabase): Audio blobs (originals/normalized), practice recordings, optional JSON result dumps.
- Workers:
  - YT worker pool (Python) for downloads/transcode.
  - Analysis worker (Node) for Gemini analysis/scoring.
- Realtime/Progress: Supabase Realtime on `jobs` or FE polling, whichever is simpler for v1.

---

### Key Flows

1) Upload Audio (direct-to-storage)
- FE → Hono: init upload → returns signed URL + object key.
- FE → Storage: PUT audio directly.
- FE → Hono: create `analysis` job with object key, target_language, karaoke flag, model_id, prompt id/version.
- Worker (Node) → reads object, uploads to Gemini files API, generates structured output, stores `SongData` JSON in `song_analysis`, marks job `succeeded`.
- FE follows `jobs/:id` to show progress; then fetches analysis.

2) YouTube Ingestion
- FE → Hono: create `yt_ingest` job with `youtube_url` + options.
- Python worker claims job (poll or webhook trigger), runs yt-dlp, transcodes to standard format (e.g., 48kHz Opus mono), uploads to Storage, updates job output with object key and metadata (e.g., youtube_id, title), marks completed or triggers `analysis` child job.
- Node worker performs analysis just like direct upload.
- FE tracks parent job → child job chain.

3) Practice Scoring
- FE → API: POST `/v1/uploads/practice` with recording blob; API stores and returns `objectKey`.
- FE → API: create `practice` job with `song_analysis_id`, verse selection, model_id, and `objectKey`.
- Worker runs scoring LLM → stores `SingingScore` in `song_practice`, marks job done.
- FE displays results; library shows practice history.

---

### API (Next.js/Hono) – v1 Surface
- Auth
  - `GET /v1/auth/me` → current user
- Uploads (server-side streaming)
  - `POST /v1/uploads/audio` → multipart/binary upload; stores and returns `{ objectKey, contentType, size }`
  - `POST /v1/uploads/practice` → multipart/binary upload; returns `{ objectKey, contentType, size }`
- Jobs
  - `POST /v1/jobs/analysis` → create analysis job for an existing object key
  - `POST /v1/jobs/youtube` → create yt_ingest job { youtubeUrl, opts }
  - `POST /v1/jobs/practice` → create scoring job
  - `GET /v1/jobs/:id` → status, progress, errors, linked record ids
  - `GET /v1/jobs` → filter by type/status (optional for v1)
- Results
  - `GET /v1/analysis/:id` → SongData JSON + metadata
  - `GET /v1/analysis` → list user analyses (paginated)
  - `GET /v1/practice/:id` → SingingScore JSON + metadata
  - `GET /v1/practice` → list user practices (paginated)
- Prompts
  - `GET /v1/prompts` → templates + versions
  - `POST /v1/prompts` (admin) → create/update with versioning
- Webhooks (HMAC signed)
  - `POST /v1/webhooks/yt-complete` → from Python service: object key + metadata

---

### Data Model (Postgres)

Users (via Supabase Auth suggested)
- Use `auth.users` + `profiles` table for app-specific fields.

Prompts
- Stores prompt templates with versions and variables for reproducibility.

Jobs (single queue for all task types)
- Durable, retryable; claimed via `FOR UPDATE SKIP LOCKED`.

Song Analysis
- Server-side results of AI analysis for a user’s audio/YouTube input.

Song Practice
- Server-side practice attempts and AI scores.

Example DDL (starter)
```sql
-- profiles (if using Supabase Auth)
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_tier text default 'free',
  quota_daily_jobs int default 50,
  created_at timestamptz default now()
);

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null,
  kind text check (kind in ('analysis','scoring')) not null,
  body text not null,
  variables jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique (name, version)
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  type text check (type in ('yt_ingest','analysis','practice')) not null,
  status text check (status in ('pending','running','succeeded','failed','canceled')) not null default 'pending',
  input jsonb not null,
  output jsonb default '{}'::jsonb,
  attempts int not null default 0,
  max_attempts int not null default 3,
  error jsonb,
  available_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on jobs (status);
create index on jobs (type);
create index on jobs (user_id);

create table if not exists song_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  object_key text not null,
  source text check (source in ('upload','youtube')) not null,
  youtube_id text,
  target_language text not null,
  original_language text,
  model_id text not null,
  karaoke_enabled boolean default false,
  duration_seconds numeric,
  processing_time_seconds numeric,
  result_json jsonb not null,
  prompt_id uuid references prompts(id),
  prompt_version int,
  prompt_snapshot text,
  created_at timestamptz default now()
);
create index on song_analysis (user_id);
create index on song_analysis (youtube_id);

create table if not exists song_practice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  song_analysis_id uuid references song_analysis(id) on delete cascade not null,
  model_id text not null,
  verses_practiced int[] not null,
  attempt_object_key text not null,
  recording_duration_seconds numeric,
  score_json jsonb not null,
  created_at timestamptz default now()
);
create index on song_practice (user_id);
create index on song_practice (song_analysis_id);
```

Row-Level Security (recommended)
- Enable RLS and add policies such as `using (user_id = auth.uid())` for all user-owned tables.

---

### Storage Layout (Object Store)
- Bucket: `media`
  - Upload audio: `users/{userId}/ingest/{uuid}_{origName}`
  - Normalized audio: `users/{userId}/normalized/{uuid}.opus` (or `.wav` 16kHz)
  - Practice: `users/{userId}/practice/{analysisId}/{timestamp}.webm`
  - Results (optional): `users/{userId}/results/{analysisId}.json`
- No direct client writes: API owns credentials and streams uploads to storage. For downloads, serve time-limited signed GET URLs or proxy via API.

---

### Auth & Authorization
- Prefer Supabase Auth:
  - Hono validates JWT, injects `user_id`.
  - RLS enforces per-user access to DB rows.
  - Storage policies constrain objects to the owner’s path.
- Alternative: Auth.js/Clerk with service credentials to Supabase (more custom policy work).

---

### Job Orchestration
- Workers claim `jobs` with `FOR UPDATE SKIP LOCKED where status='pending' and available_at <= now()`.
- Retries: increment `attempts`, set `available_at` on backoff; move to `failed` after `max_attempts`.
- Progress: update `jobs.output.progress_percent`, track stage and timestamps; FE polls or subscribes.
- Idempotency: de-duplicate by `(youtube_id, model_id, lang, karaoke, prompt_version)` or `(object_key, param set)`.

---

### AI Processing (Server-side)
- Analysis:
  - Read from Storage (signed URL or server credentials), upload to Gemini files API.
  - Provide `responseSchema` and strict prompts.
  - Parse/normalize on server; store `result_json` and timings.
- Scoring:
  - Convert practice Blob to base64 inline data.
  - Prompt with transliteration references + relative timings derived from analysis data.
- Guards:
  - Enforce max audio length; standardize to mono/48k (Opus/WAV) to improve speed and reliability.

---

### Security
- Server-side uploads with size/type/content validation at API layer; use signed GET URLs for downloads if needed.
- HMAC-signed webhooks between Python and Hono.
- Rate limiting per user/IP (Redis or Postgres sliding window).
- Secrets in managed secret store; never expose to client.

---

### Observability
- Structured logs with job IDs and durations.
- Store failure details in `jobs.error` (truncate long payloads responsibly).
- Metrics: job counts, latencies, failure rates, LLM usage proxies.
- Optional Sentry for FE + BE.

---

### Caching & Dedup
- Hash normalized audio (SHA256) to avoid duplicate analyses for same params.
- YouTube dedup by `youtube_id` + parameter set.

---

### Limits & Quotas
- `profiles` tracks plan tiers and daily quotas.
- Limit job creation per day, audio length, and practice attempts.
- Gate advanced models (Pro) or karaoke mode by plan.

---

### Prompt Management
- `prompts` table versioning.
- Snapshot resolved prompt per job/record for reproducibility.
- Keep schema and prompt in sync; update schema first when expanding output shape.

---

### Python Worker (FastAPI) – Outline
- Claim: fetch next `yt_ingest` job (`pending`, `available_at <= now()`), mark `running`.
- Run: yt-dlp → transcode (ffmpeg) → upload to Storage → fill `output` with object key + metadata.
- Complete: mark `succeeded` OR enqueue/chain an `analysis` job.
- Use HMAC-signed calls to Hono if using webhooks instead of direct DB writes.

---

### Hono Worker – Outline
- Claim `analysis` and `practice` jobs.
- Analysis: download from Storage → Gemini → parse → insert `song_analysis` → update job.
- Practice: download practice audio → Gemini → insert `song_practice` → update job.
- Respect idempotency keys and backoff.

---

### Phased Delivery
1) Phase 1: Auth + uploads + analysis jobs; FE consumes BE endpoints.
2) Phase 2: Practice scoring jobs + server persistence; FE replaces local DB.
3) Phase 3: YouTube ingest worker + job chaining; dedup + quotas.
4) Phase 4: Realtime updates, rate limiting, caching/dedup policies, and admin prompt UI.

---

### Open Questions
- Hosting targets for Hono (Node server vs Workers) and Python worker (container vs serverless).
- Realtime strategy (Supabase Realtime vs polling) initially.
- Audio max duration and supported media types.
- Which Gemini models by tier; cost guardrails and fallbacks.

### Non‑Goals (v1)
- Full-text search over verse/segment content (can add later by normalizing verse tables).
- Public sharing/embedding flows (focus on private library first).

---

### Rationale & Improvements
- Single `jobs` table simplifies orchestration and monitoring; different workers handle types.
- Direct-to-storage uploads keep API stateless for large files.
- Server-side AI guarantees secret hygiene, reproducibility, and consistent parsing.
- Normalizing audio format reduces compute variability and cost.
- Prompt versioning prevents accidental regression in historical results.

This v1 plan prioritizes correctness, durability, and clear ownership boundaries across FE, API, and workers while keeping room for scalable features (realtime, quotas, dedup, admin tooling).

---

### Architecture Diagram (Mermaid)

```mermaid
flowchart LR
  subgraph Client ["Client"]
    FE["Frontend (React)"]
  end

  subgraph Backend ["API (Next.js/Hono)"]
    API["Route Handlers"]
  end

  subgraph Infra ["Infra"]
    Storage["Object Storage<br/>S3-compatible"]
    DB["Postgres"]
  end

  subgraph Workers ["Workers"]
    W1["Analysis Worker"]
  end

  LLM["Gemini API"]

  FE -- "1. Init upload" --> API
  FE -- "2. Upload audio" --> Storage
  FE -- "3. Create analysis job" --> API
  API -- "4. Record job" --> DB
  W1 -- "5. Process audio (fetch + Gemini)" --> LLM
  W1 -- "6. Save result" --> DB
  FE -- "7. Fetch status/results" --> API
```

---

### ER Diagram (Mermaid)

```mermaid
erDiagram
  PROFILES ||--o{ JOBS : "owns"
  PROFILES ||--o{ SONG_ANALYSIS : "owns"
  PROFILES ||--o{ SONG_PRACTICE : "owns"
  PROMPTS  ||--o{ SONG_ANALYSIS : "used by"
  SONG_ANALYSIS ||--o{ SONG_PRACTICE : "referenced"

  PROFILES {
    uuid user_id PK
    text plan_tier
    int  quota_daily_jobs
    timestamptz created_at
  }

  PROMPTS {
    uuid id PK
    text name
    int  version
    text kind
    text body
    jsonb variables
    uuid created_by FK
    timestamptz created_at
  }

  JOBS {
    uuid id PK
    uuid user_id FK
    text type
    text status
    jsonb input
    jsonb output
    int attempts
    int max_attempts
    jsonb error
    timestamptz available_at
    timestamptz created_at
    timestamptz updated_at
  }

  SONG_ANALYSIS {
    uuid id PK
    uuid user_id FK
    text object_key
    text source
    text youtube_id
    text target_language
    text original_language
    text model_id
    bool karaoke_enabled
    numeric duration_seconds
    numeric processing_time_seconds
    jsonb result_json
    uuid prompt_id FK
    int  prompt_version
    text prompt_snapshot
    timestamptz created_at
  }

  SONG_PRACTICE {
    uuid id PK
    uuid user_id FK
    uuid song_analysis_id FK
    text model_id
    int[] verses_practiced
    text attempt_object_key
    numeric recording_duration_seconds
    jsonb score_json
    timestamptz created_at
  }
```

#### Numbered Flow (Life of a Song Analysis)
1. Init upload: Client requests a signed URL/token from API to upload audio directly to object storage.
2. Upload audio: Client uploads the audio file to storage using the signed URL.
3. Create analysis job: Client asks API to analyze the uploaded object (model, language, flags).
4. Record job: API persists a new job row in Postgres (status=pending).
5. Process audio: Worker claims the job, fetches the audio from storage, and calls Gemini to analyze.
6. Save result: Worker stores structured SongData in Postgres and marks the job succeeded.
7. Fetch status/results: Client polls or queries API for job status and retrieves analysis results.

---

### Local Backend Scaffolding (September 2025)

- Added a lightweight Vercel serverless handler at `api/echo.ts` to verify the browser → backend path before migrating Gemini calls. The handler logs the incoming method/query/body and responds with `{ message, method, receivedAt, hasBody }`.
- Created `components/EchoTester.tsx`, rendered inside the Tech Details page, so contributors can POST/GET against `/api/echo`, see success notifications, and inspect console logs without leaving the UI.
- Updated `vite.config.ts` to proxy `/api/*` to the Vercel dev server and to honor `HOST`/`PORT` from `vercel dev`, preventing the CLI from timing out when it assigns random ports.
- Relaxed `tsconfig.json` (switch to `moduleResolution: "node"`, drop unsupported flags) and removed `.ts` import suffixes so the build pipeline works both locally and in Vercel’s TypeScript runtime.
- Local workflow: run `npx vercel dev --listen 3000 --debug` (starts Vite on the injected port), then hit `http://localhost:3000/api/echo?message=test` or use the Echo Tester to confirm end-to-end connectivity before wiring real Gemini endpoints.

### Server-Side Gemini Migration (September 2025)

- Introduced shared helper `api/_lib/gemini.ts` (dotenv bootstrap, cached `GoogleGenAI` client, model resolution) so all API routes consistently load keys from `.env.local`/environment.
- Added `api/song-analysis.ts` to handle song processing requests: accepts base64 audio plus metadata, uploads to Gemini, reuses existing prompt/verse parsing utilities, and returns normalized `SongData` with timing info.
- Added `api/singing-feedback.ts` to accept practice recordings and verse context, call Gemini with structured schema, and respond with `SingingScore` objects identical to the prior client-side implementation.
- Refactored the browser `services/geminiService.ts` to delegate to the new endpoints via `fetch`, removing direct SDK usage from the frontend while preserving progress messaging hooks.
- Kept the Echo tester for quick sanity checks; it now runs on top of the shared helper, mirroring the production Gemini setup.
