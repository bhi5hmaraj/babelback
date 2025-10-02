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

## Troubleshooting
- YouTube 403 / "Only images available": try again (residential proxy is enabled), or switch to a different video. Cookies are usually not required with the current proxy + m4a strategy.
- Signed URL 403: ensure the signer service account has `roles/iam.serviceAccountTokenCreator` and `roles/storage.objectCreator` on the bucket.
- npm EJSONPARSE: package.json must be valid JSON; commas between entries, no trailing commas.
