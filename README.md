# Babelback

Synced lyric explorer + singing coach powered by Gemini. The app analyzes songs (timed verses, translation/transliteration) and lets you practice singing with feedback.

As of October 2025 the project consists of:

- Frontend (Vite + React)
  - UI for uploading a song, selecting target language, and viewing synchronized verses.
  - Practice recorder and score viewer (pronunciation, timing, clarity).
- Server (Vercel API routes, Hono‑style handlers)
  - Gemeni orchestration endpoints for song analysis and singing feedback.
  - A YouTube download “job” API that mints GCS signed URLs and starts an Apify run.
- Downloader (Apify Actor, yt‑dlp)
  - Runs yt‑dlp with Apify Residential proxy when needed.
  - Uploads audio directly to Google Cloud Storage (GCS) using a short‑lived V4 signed PUT minted by the API.
  - Current mode is polling‑first (webhooks/SSE coming next).

Key files and docs
- Design overview: DESIGN.md (Edge/Node split; Apify + GCS signed PUT flow; future SSE/webhooks)
- Agents/prompting: AGENTS.md (Song Analysis Agent, Singing Coach Agent)
- API routes:
  - `api/song-analysis.ts` and `api/singing-feedback.ts` — Gemini endpoints
  - `api/downloads.ts` — create download job (mints GCS signed PUT, starts Apify)
  - `api/downloads/[id].ts` — poll job status (polls Apify run in “running” state)
  - `api/downloads/[id]/callback.ts` — webhook endpoint (present but not used yet; TODO to enable)
- Apify Actor: `actors/yt-audio-basic` — minimal yt‑dlp actor with optional direct‑to‑GCS upload
- GCS signer (local testing): `scripts/sign-gcs.cjs`

## Architecture

```mermaid
flowchart TD
  %% Client
  subgraph Client["Babelback Web App (Vite + React)"]
    UI["1) Choose Source\n2) AI Model\n3) Target Language\n4) Modes\n5) Babelback"]
    Player["Audio Player"]
    IDB[("IndexedDB\nLibrary + Practice Attempts")]
  end

  %% Server (Vercel)
  subgraph Vercel["Hono API (Vercel)"]
    Downloads["POST /api/downloads\n(Node runtime)\n• Mint GCS signed PUT/GET\n• Start Apify run\n• Create job record"]
    JobPoll["GET /api/downloads/:id\n• Poll Apify run\n• Mint fresh signed GET\n• Return status + url"]
    Proxy["GET /api/proxy?url=...\n• Stream GCS → client\n• Avoid CORS"]
    SongAnalysis["POST /api/song-analysis\n• Fetch audio (URL/Blob)\n• Call Gemini\n• Return SongData"]
    SingingFeedback["POST /api/singing-feedback\n• Score attempt via Gemini"]
    Health["GET /api/health"]
    KV[("Job Store\nRedis / Vercel KV / Memory")]
  end

  %% Apify
  subgraph Apify["Apify Actor (yt-dlp)"]
    Actor["yt-dlp runner\nUploads to GCS via signed PUT"]
  end

  %% GCS
  subgraph GCS["Google Cloud Storage"]
    Bucket[("gs://<GCS_BUCKET>")]
  end

  %% Gemini
  subgraph Gemini["Google Gemini"]
    GeminiAPI[("Gemini Models")] 
  end

  %% Main YouTube flow
  UI -->|YouTube URL| Downloads
  Downloads -->|Mint signed PUT/GET| Bucket
  Downloads -->|Start run| Actor
  Downloads <--> KV

  %% Polling for status
  UI -->|poll jobId| JobPoll
  JobPoll -->|Query run| Actor
  Actor -->|PUT audio| Bucket
  JobPoll -->|Return fresh signed GET| UI

  %% Playback + Analysis
  UI -->|Stream via proxy| Proxy --> Bucket
  UI -->|Analyze| SongAnalysis --> GeminiAPI --> SongAnalysis --> UI
  UI -->|Practice| SingingFeedback --> GeminiAPI --> SingingFeedback --> UI
  UI -->|Save to library| IDB

  %% Optional (future)
  Callback["POST /api/downloads/:id/callback\n(HMAC) (future)"]
  Actor -.->|Webhook| Callback
  Callback -.-> KV
  SSE["GET /api/downloads/:id/events\n(SSE) (future)"]
  Vercel -.-> SSE
```

## Running Locally

Prerequisites
- Node.js 20+
- Vercel CLI (`npm i -g vercel`) is handy for dev

1) Install dependencies

```bash
npm install
```

2) Configure environment

Create `.env.local` at repo root with:

```bash
# Gemini API for analysis/feedback endpoints
GEMINI_API_KEY=... 

# Google Cloud signing (choose ONE of the two shapes)
# A) Single JSON (recommended)
GCP_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}'

# B) Split fields
# GCP_PROJECT_ID=...
# GCP_CLIENT_EMAIL=...
# GCP_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'

# Storage
GCS_BUCKET=babelback-dev

# Apify (actor runner)
APIFY_ACTOR_ID=<your_handle~yt-audio-basic or actor id>
APIFY_TOKEN=<apify_api_token>

# Optional for webhook testing via tunnel (e.g., localtunnel/ngrok)
# BASE_URL=https://your-tunnel.example
```

3) Start the dev server

```bash
npx vercel dev --listen 3000
```

4) Try a YouTube download job (polling‑first)

```bash
curl -s -X POST http://localhost:3000/api/downloads \
  -H 'content-type: application/json' \
  -d '{"youtubeUrl":"https://www.youtube.com/watch?v=IdveDKCYtI8","audioFormat":"m4a"}' | jq

# Then poll status
curl -s http://localhost:3000/api/downloads/<jobId> | jq
```

If successful, the response contains a signed GET URL (valid a few hours) to stream the m4a from GCS.

Notes
- Webhooks/SSE: present in code but disabled for now; the flow uses polling to keep setup simple. See DESIGN.md (TODOs) for the webhook+SSE plan.
- Apify actor source lives under `actors/yt-audio-basic` (runs yt‑dlp and uploads via signed PUT).
- Do not commit secrets or media: `.gitignore` excludes cookies, local audio, and env files.

## Deploying

Add these to Vercel Project → Settings → Environment Variables (Production/Preview/Dev as needed):
- GCP_SERVICE_ACCOUNT_KEY (or GCP_PROJECT_ID / GCP_CLIENT_EMAIL / GCP_PRIVATE_KEY)
- GCS_BUCKET=babelback-dev
- APIFY_ACTOR_ID, APIFY_TOKEN
- GEMINI_API_KEY

The downloads API routes are pinned to Node runtime via `vercel.json` so that `@google-cloud/storage` works for signed URLs.

## Vercel Deploy & Env Setup (CLI)

Link project (one-time):

```bash
npx vercel login
npx vercel link
```

Bulk-import envs from `.env.local` (Preview and/or Production):

```bash
# Make the helper executable (one-time)
chmod +x scripts/vercel-env-import.sh

# Import to Preview env
scripts/vercel-env-import.sh -f .env.local -t preview

# Import to Production env
scripts/vercel-env-import.sh -f .env.local -t production

# Force replace existing keys if needed
scripts/vercel-env-import.sh -f .env.local -t preview,production --force

# Verify
vercel env ls
```

Notes on `GCP_SERVICE_ACCOUNT_KEY`:

```bash
# If you have a multi-line JSON file, minify to one line first
jq -c . path/to/service-account.json > /tmp/sa.min.json
echo "GCP_SERVICE_ACCOUNT_KEY=$(cat /tmp/sa.min.json)" >> .env.local
```

Deploy to Preview (uses Preview env vars):

```bash
npx vercel --confirm
```

Deploy to Production (uses Production env vars):

```bash
npx vercel --prod --confirm
```

Optional: dedicated preview branch

```bash
git checkout -b preview
git push -u origin preview
# In Vercel → Project Settings → Git:
#   - Set Production Branch to `main`
#   - Ensure “Deploy Previews for every git push” is enabled
```

## Troubleshooting
- YouTube 403 / "Only images available": try again (residential proxy is enabled), or switch to a different video. Cookies are usually not required with the current proxy + m4a strategy.
- Signed URL 403: ensure the signer service account has `roles/iam.serviceAccountTokenCreator` and `roles/storage.objectCreator` on the bucket.
- npm EJSONPARSE: package.json must be valid JSON; commas between entries, no trailing commas.
