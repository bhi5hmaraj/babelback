# Babelback Analytics Spec (GA4)

This document defines a minimal, privacy‑safe analytics taxonomy for Babelback using Google Analytics 4 (GA4). It aligns with the current implementation (client GA tag + server Measurement Protocol) and is designed to support UX improvements, reliability monitoring, and cost insights without collecting PII.

## Goals
- Track success/failure and latency of key flows (uploads, analysis, YouTube ingest).
- Quantify adoption by language, model, and mode (karaoke vs standard).
- Power the heuristic progress bar with real distributions (duration vs size).
- Keep payloads small, anonymous, and consent‑respecting.

## Events (names are lowercase, snake_case)

Core (implemented)
- upload_start (client)
  - source: 'file'
  - content_type: string (e.g., 'audio/mpeg')
  - size_bytes: number
  - ext: string (file extension)
- upload_done (client + server)
  - source: 'file'
  - size_bytes: number
  - duration_ms: number
  - content_type?: string
  - ok: 1 (success)
  - method?: 'base64' (only when client fallback path used)
- upload_error (server)
  - source: 'file'
  - content_type?: string
  - duration_ms: number
  - ok: 0
  - msg: string (truncated, no PII)

- analysis_start (client)
  - source: 'file' | 'url' | 'yt_apify'
  - model_id: string
  - lang: string (UI target language)
  - karaoke: 0 | 1
- analysis_done (server)
  - model_id: string
  - verses: number
  - duration_ms: number
  - mime_type: string
  - karaoke: 0 | 1
- analysis_error (server)
  - duration_ms: number
  - message: string (truncated, no PII)
  - error_type: 'analysis' | 'fetch_audio_url' | ...
  - code?: string when error_type='fetch_audio_url'
- analysis_fetch_retry (server)
  - error_type: 'fetch_audio_url'
  - attempt: number (starting at 1)
  - code: string (e.g., EAI_AGAIN, ETIMEDOUT)
  - job_id: string (when available)

Optional (future)
- yt_download_start / yt_download_done / yt_download_error (server)
  - Fields: source='yt', audio_format, duration_ms, ok (0/1), message? (truncated)

## Parameters (custom definitions to register)
Add these in GA4 Admin → Property → Custom definitions.

- Custom metrics (Event scope)
  - upload_duration_ms — upload phase duration in ms (client/server)
  - ai_duration_ms — analysis phase duration in ms (server)
  - yt_duration_ms — YouTube ingest duration in ms (server)
  - size_bytes — upload/object size in bytes
  - verses — verses counted in analysis

- Custom dimensions (Event scope)
  - job_id — stable join key across phases
  - source — event source (file|url|yt_apify|yt)
  - model_id — AI model id
  - lang — target language code
  - error_type — normalized error class (upload|analysis|yt)
  - error_code — transport/code string (e.g., EAI_AGAIN, ETIMEDOUT) for fetch retries/errors
  - origin — emitter (`client` | `server`)
  - content_type — MIME type of uploaded audio (optional)
  - mime_type — MIME seen by analysis (optional)
  - ext — file extension (optional)
  - method — upload method (e.g., base64) (optional)
  - ok — success flag (0/1) (optional)

Event parameter names must match the list above (e.g., event parameter `job_id` for the job_id dimension).

Notes
- No PII: never send emails, raw URLs, tokens, or IDs that can identify a person.
- Keep error messages truncated and generic.

-## Architecture
## Architecture
- Client (web): GA tag in `index.html`, helper in `services/analytics.ts` routes `trackEvent(name, params)` to `window.gtag('event', ...)`.
  - In dev/local, DebugView is enabled automatically; you can also force with `?debug_view=1` or `localStorage.GA_DEBUG='1'`.
  - Adds `origin='client'` to events unless already provided.
- Server (API): Minimal GA4 Measurement Protocol helper in `api/_lib/ga.ts`.
  - Sends events anonymously (random server client_id) using env vars `GA_MEASUREMENT_ID` and `GA_API_SECRET`.
  - In debug (`GA_DEBUG=1`), adds `debug_mode:1` and sends to both `/mp/collect` (ingests) and `/debug/mp/collect` (validation).
  - Only emits server‑side events for outcomes (`analysis_done/error`, `upload_done/error`).
  - Adds `origin='server'` to events unless already provided.
- Redis: NOT used for events (kept only for progress heuristics).

## Current Instrumentation Map
- Client
  - services/geminiService.ts
    - upload_start (before POST /api/uploads/audio)
    - upload_done (after upload success; method='base64' when fallback path used)
  - useSongDataManager (file URL flow)
    - analysis_start (already tracked via client helper)
- Server
  - api/uploads/audio.ts
    - upload_done (size_bytes, duration_ms)
    - upload_error
  - api/song-analysis.ts
    - analysis_done (verses, duration_ms, model_id, mime_type, karaoke)
    - analysis_error (duration_ms, message)

## Dashboards / Queries
- Realtime → DebugView for validation.
- Explorations
  - Upload duration by size buckets (custom metric vs binned dimension).
- Analysis duration (ai_duration_ms) by model_id/lang/karaoke.
- YouTube ingest duration (yt_duration_ms) by source 'yt_apify'.
- Error rates by error_type (upload|analysis|yt) and source.
- (Optional) BigQuery export: enable in GA4 Admin → BigQuery Links for raw analysis.

## QA / Validation Checklist
- GA tag loads only after consent (future toggle).
- Client events appear in DebugView with expected params.
- Server events appear with anonymous `client_id` (we deliberately do not join with the web client at this time).
- Custom definitions created for metrics/dimensions listed above.

## Task Breakdown

Phase 1 — Client GA (DONE)
- [x] Add GA tag (G‑PVPZ0KEKKW) in `index.html`.
- [x] Replace Vercel Analytics with GA helper (`services/analytics.ts`).
- [x] Emit `upload_start` / `upload_done` from client upload flow.
- [x] Emit `analysis_start` from UI.

Phase 2 — Server GA outcomes (DONE)
- [x] Add GA MP helper `api/_lib/ga.ts` (env: `GA_MEASUREMENT_ID`, `GA_API_SECRET`).
- [x] Emit `upload_done` / `upload_error` in `api/uploads/audio.ts`.
- [x] Emit `analysis_done` / `analysis_error` in `api/song-analysis.ts`.

Phase 3 — GA Admin setup (PENDING)
- [ ] Register custom metrics: `duration_ms`, `size_bytes`, `verses`.
- [ ] Register custom dimensions: `source`, `content_type`, `ext`, `method`, `model_id`, `lang`, `karaoke`, `ok`, `mime_type`.
- [ ] Create basic Explorations (Upload Duration vs Size, Analysis Duration vs Model/Language).
- [ ] (Optional) Enable BigQuery export.

Phase 4 — YouTube metrics (OPTIONAL)
- [ ] Emit `yt_download_*` events on the server download flow.
- [ ] Add simple dashboard panel for YouTube success rate and timing.

Phase 5 — Consent & Governance (PENDING)
- [ ] Add a cookie/consent toggle to gate GA initialization.
- [ ] Document the event taxonomy in the privacy notice; reiterate no PII.

Phase 6 — Heuristic Improvements (PENDING)
- [ ] Use GA distributions (or Redis heuristics) to tune progress bar curves per size bucket/model.
- [ ] Track prediction vs actual error in a separate (local) debug log until satisfactory.

## Environment Vars
- `GA_MEASUREMENT_ID` = G‑PVPZ0KEKKW (or use `NEXT_PUBLIC_GA_MEASUREMENT_ID` for client)
- `GA_API_SECRET` = GA4 Measurement Protocol API Secret
- (Dev) `GA_DEBUG=1` to show server events in DebugView and validate via `/debug/mp/collect` (we still send to `/mp/collect` so events appear).

### DebugView quick start
- GA Console → Configure → DebugView.
- Local/dev website: events are flagged automatically; or append `?debug_view=1` to the URL; or set `localStorage.GA_DEBUG='1'`.
- Server/API: export `GA_DEBUG=1` so server events include `debug_mode:1` and are also validated.

---

If/when we later want to correlate server and client events to the same user/session, we can add a consented GA `client_id` cookie and pass it to `gaEvent()`. For now, all server events are anonymous by design.
