# DEPRECATED (check the apify actor)


# Google Cloud Functions (2nd gen) — YouTube → GCS (audio‑only) 

Overview
- HTTP function downloads YouTube audio with `yt-dlp`, uploads to a Google Cloud Storage bucket, and returns a V4 signed URL you can pass to your existing `api/song-analysis` as `audioUrl`.
- Default is audio‑only (no ffmpeg). You can enable video+audio by sending `{"video": true}`.

Files
- `main.py` — Cloud Function entrypoint (`download`).
- `requirements.txt` — Python deps: `functions-framework`, `google-cloud-storage`, `yt-dlp`.
- `deploy.sh` — Example deployment script.
- `cors.json` — Example CORS config for the bucket if the browser should fetch directly.

Prereqs
1) Install/initialize gcloud and set your project:
   - `gcloud auth login`
   - `gcloud config set project <PROJECT_ID>`
2) Enable APIs:
   - `gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com`
3) Create/select a GCS bucket:
   - `gcloud storage buckets create gs://<YOUR_BUCKET> --location=us-central1` (or use an existing one)
4) (Optional) Grant the default compute SA storage access if needed:
   - `gcloud projects add-iam-policy-binding <PROJECT_ID> \
      --member="serviceAccount:$(gcloud projects describe <PROJECT_ID> --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
      --role="roles/storage.objectAdmin"`

Local Dev
- Install deps: `pip install -r requirements.txt`
- Run locally: `functions-framework --target=download --port=8081`
- Test download only (no upload):
  - `curl -sS -X POST http://127.0.0.1:8081 -H 'Content-Type: application/json' -d '{"url":"https://www.youtube.com/watch?v=XXXXXXXX", "local": true}' | jq`
- Expected result includes a `/tmp/ytdl/<id>.<ext>` path and metadata.

Deploy (2nd gen)
- Edit `deploy.sh` or run this directly:
```
gcloud functions deploy download_youtube \
  --gen2 \
  --runtime python312 \
  --region us-central1 \
  --source . \
  --entry-point download \
  --trigger-http \
  --allow-unauthenticated \
  --timeout 3600 \
  --memory 1024Mi \
  --set-env-vars BUCKET_NAME=<YOUR_BUCKET>
```
- Get the URL:
  - `gcloud functions describe download_youtube --region us-central1 --format='value(serviceConfig.uri)'`

Usage
- Upload to bucket and get a signed URL (24h):
```
curl -sS -X POST "<FUNCTION_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
        "url": "https://www.youtube.com/watch?v=XXXXXXXX"
      }' | jq
```
- Response (abridged):
```
{
  "ok": true,
  "bucket": "<YOUR_BUCKET>",
  "objectPath": "youtube/<id>/<title>-<id>.m4a",
  "gsUri": "gs://<YOUR_BUCKET>/youtube/<id>/<title>-<id>.m4a",
  "signedUrl": "https://storage.googleapis.com/...",
  "video": { "id": "<id>", "title": "...", "duration": 123 },
  "elapsedMs": 12345
}
```

Pass to Analysis API
- Use the `signedUrl` as `audioUrl`:
```
curl -sS -X POST http://localhost:3009/api/song-analysis \
  -H 'Content-Type: application/json' \
  -d '{
        "audioUrl": "<signedUrl>",
        "targetLanguage": "English",
        "enableKaraokeMode": true,
        "modelId": "gemini-2.5-flash"
      }' | jq
```

Browser Access (CORS)
- If you want the browser to GET the object directly from GCS, configure CORS on the bucket using `cors.json`:
```
gcloud storage buckets update gs://<YOUR_BUCKET> --cors-file=cors.json
```

Notes
- 2nd gen HTTP functions allow up to 60 minutes per request.
- This function avoids ffmpeg by selecting native audio formats.
- For heavy workloads or custom tooling (ffmpeg), use Cloud Run with a container.

