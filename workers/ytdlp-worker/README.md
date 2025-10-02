yt-dlp GCS Worker (Cloud Run)

Purpose
- Download audio from a URL (YouTube and many others), extract to an audio-only file, upload to Google Cloud Storage, generate a signed URL, and call back your Hono webhook running on Vercel Edge.

Endpoints
- POST /download → { jobId, sourceUrl, callbackUrl, objectName?, contentType?, audioFormat? }
- GET  /healthz → simple health check

Environment
- GCS_BUCKET (required): target bucket name
- GCS_SIGNED_URL_TTL_SECONDS (default 7200)
- CALLBACK_SECRET (required): HMAC secret to sign webhook body
- OBJECT_PREFIX (default "downloads"): prefix for object names when not provided
- YTDLP_NO_UPDATE=1 (recommended) disables yt-dlp self-update
- XDG_CACHE_HOME=/tmp/ytcache to reuse caches per instance

Deploy (Artifact Registry + Cloud Run)
1) Build the image
   gcloud builds submit workers/ytdlp-worker \
     --tag us-central1-docker.pkg.dev/PROJECT/containers/ytdlp-worker:$(git rev-parse --short HEAD)

2) Deploy to Cloud Run
   gcloud run deploy ytdlp-worker \
     --image us-central1-docker.pkg.dev/PROJECT/containers/ytdlp-worker:COMMIT \
     --region us-central1 \
     --allow-unauthenticated \
     --cpu 1 --memory 1Gi --max-instances 10 \
     --set-env-vars GCS_BUCKET=your-bucket,CALLBACK_SECRET=supersecret,GCS_SIGNED_URL_TTL_SECONDS=7200,YTDLP_NO_UPDATE=1,XDG_CACHE_HOME=/tmp/ytcache

3) Service account permissions
- roles/storage.objectCreator on the bucket
- roles/storage.objectViewer (optional, if verifying uploads)
- roles/iam.serviceAccountTokenCreator (for V4 signed URLs without key file)

Hono Integration
- Hono route POST /api/downloads creates a job and invokes this worker:
  body: { jobId, sourceUrl, callbackUrl, objectName? }
- This worker uploads and POSTs to /api/downloads/:jobId/callback with headers:
  X-Job-Id: <jobId>
  X-Signature: <HMAC-SHA256 of raw JSON body using CALLBACK_SECRET>

Local Dev
  cp .env.example .env  # edit values as needed
  python -m venv .venv && . .venv/bin/activate
  pip install -r requirements.txt
  # .env will be auto-loaded by the app
  uvicorn src.main:app --reload --port 8080

Notes
- ffmpeg is installed in the image; no per-invoke install.
- Defaults prefer m4a (format 140) and iOS/TV clients to avoid 403 issues seen with opus/webm (251). Override via env:
  - `YTDLP_YT_CLIENTS=ios,tv,web`
  - `YTDLP_COOKIES_FILE=/cookies/cookies.txt` (mount a Netscape cookies.txt)
  - `PROXY_URL=socks5h://tor:9050` (or HTTP proxy) — yt-dlp only
  - `YTDLP_USER_AGENT="..."` (force a specific UA)
  - `YTDLP_FORMAT_EXPR="bestaudio[ext=m4a]/140/bestaudio"` (override format selection)
  - `YTDLP_FORCE_IPV4=1` (use IPv4 source address)

Save locally (no GCS) using the image’s yt-dlp
  mkdir -p downloads
  # Try iOS client + m4a first
  docker run --rm -v "$PWD/downloads:/out" ytdlp-worker \
    yt-dlp --extractor-args "youtube:player_client=ios" \
      -f "bestaudio[ext=m4a]/bestaudio" -x --audio-format m4a \
      -o "/out/%(title)s [%(id)s].%(ext)s" "https://www.youtube.com/watch?v=VIDEO_ID"
  # If YouTube challenges, export cookies and pass:
  docker run --rm -v "$PWD/downloads:/out" -v "$PWD/cookies.txt:/cookies/cookies.txt:ro" ytdlp-worker \
    yt-dlp --cookies /cookies/cookies.txt -x -o "/out/%(id)s.%(ext)s" "URL"

Test locally without Docker (module form)
  # from repo root or workers/ytdlp-worker
  cd workers/ytdlp-worker
  python -m venv .venv && . .venv/bin/activate
  pip install -r requirements.txt
  export YTDLP_COOKIES_FILE=/abs/path/yt_cookie.txt
  export YTDLP_USER_AGENT='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  python -m src.test_ytdlp --url "https://www.youtube.com/watch?v=IdveDKCYtI8" --format m4a

Run the service with .env (Docker)
  # build
  docker build -t ytdlp-worker workers/ytdlp-worker
  # copy and edit env
  cp workers/ytdlp-worker/.env.example workers/ytdlp-worker/.env
  # run (mount secrets referenced in .env)
  docker run --rm -p 8080:8080 --env-file workers/ytdlp-worker/.env \
    -v /abs/path/yt_cookie.txt:/secrets/cookies.txt:ro \
    -v /abs/path/sa.json:/secrets/key.json:ro \
    ytdlp-worker

Blocking test via API (no webhook)
  curl -s -X POST "http://localhost:8080/download?track=true&wait=true" \
    -H "content-type: application/json" \
    -d '{"jobId":"dev-1","sourceUrl":"https://www.youtube.com/watch?v=IdveDKCYtI8","audioFormat":"m4a"}' | jq
