# Babelback Agents

This document explains the AI “agents” that power Babelback, how they are wired into the app, the data contracts they honor, and how to extend or tune them. In Babelback, agents are purpose‑built integrations around Google’s Gemini models that take structured inputs and return strongly typed, structured outputs used by the UI.

## Overview

- Song Analysis Agent: Transcribes the uploaded audio, detects language, segments into verses with timings, and returns translation, transliteration, meanings, plus song‑level summary and analysis. Optionally returns karaoke‑grade, phrase‑level timing segments.
- Singing Coach Agent: Scores a user’s practice recording against selected verses, returning an overall score and detailed verse‑level feedback for pronunciation, timing, and vocal clarity.

Supporting modules handle prompt construction, JSON schema enforcement, robust parsing, audio device management, and local persistence.

Key files
- `services/geminiService.ts`: Agent implementations and Gemini SDK usage
- `services/prompts.ts`: System and user prompts for both agents
- `services/verseParser.ts`: Safe parsing/normalization of AI verse data
- `hooks/useSongDataManager.ts`: Orchestrates Song Analysis Agent lifecycle
- `hooks/useSingingPractice.ts`: Orchestrates Singing Coach Agent lifecycle
- `components/ModelSelector.tsx`: Model selection UI
- `constants.ts` and `types.ts`: Model IDs, supported languages, and data contracts

Environment
- API key: `process.env.GEMINI_API_KEY` or `process.env.API_KEY` or `import.meta.env.VITE_GEMINI_API_KEY`
- Models: configured in `constants.ts` (`AVAILABLE_MODELS`, `DEFAULT_MODEL_ID`)

Initialization
- `useAppInitializer` finds the API key and exposes it to `App.tsx`
- `initializeAiClient(resolvedApiKey)` is called once in `App.tsx` to set up a module‑scoped `GoogleGenAI` client

---

## Song Analysis Agent

Purpose
- Turn an uploaded audio file into rich, structured `SongData` for synchronized lyric exploration and translation.

Entrypoint
- `fetchSongDataFromGemini(audioFile, targetLanguage, enableKaraokeMode, modelId, onProgress?)` in `services/geminiService.ts`

Inputs
- `audioFile`: Browser `File`
- `targetLanguage`: `Language` enum (see `types.ts`)
- `enableKaraokeMode`: `boolean` (controls output shape)
- `modelId`: string from `AVAILABLE_MODELS`
- `onProgress?`: `(message: string) => void` used to surface friendly progress text in the UI

Outputs
- `SongData` (see `types.ts`):
  - `title`, `originalLanguage`
  - `summary`, `detailedAnalysis` (target‑language, colloquial)
  - `verses: Verse[]` with per‑verse timings and either:
    - Karaoke mode ON: `transliterationSegments[]` and `translationSegments[]` with phrase‑level `MM:SS.sss` timings
    - Karaoke mode OFF: `transliteration` and `translation` as full strings

Flow
1. File upload: `ai.files.upload` to obtain `fileUri` and `mimeType`.
2. Prompting: Builds `contents` with file part and the user prompt (`getSongAnalysisUserPromptText`). Supplies a system instruction (`getSongAnalysisSystemPrompt`) and a strict `responseSchema` to Gemini.
3. Generation: `ai.models.generateContent({ model, contents, config: { responseMimeType: 'application/json', responseSchema, systemInstruction } })`
4. Parsing: JSON parse, with defensive handling for fenced code blocks and schema misalignments.
5. Normalization: `parseSongVerses` converts all timestamps to seconds, sorts verses by start time, fills safe fallbacks, and re‑numbers verses sequentially.

Prompting specifics (`services/prompts.ts`)
- Transliteration instruction adapts to the chosen target language:
  - English targets receive explicit, English‑readable phonetic guidance (even if the original is Latin script).
  - Non‑English targets request transliteration rendered in the target’s native script.
- Karaoke mode prompt emphasizes:
  - Phrase grouping (3–5 words typical), matching transliteration/translation segment pairs
  - Strict `MM:SS.sss` timing and one‑to‑one segment alignment between transliteration and translation
- All user‑facing text (translation/meaning/summary/analysis) must be in the target language’s native script and colloquial voice.

Schema enforcement
- A Gemini `responseSchema` (via `@google/genai` `Type`) is provided to drive structured JSON.
- Parsing includes error reporting with response previews and contextual snippets for JSON errors.

Karaoke mode vs standard mode
- ON: Returns `transliterationSegments[]` and `translationSegments[]` with explicit phrase timings; the UI highlights phrase pairs during playback.
- OFF: Returns single full‑string `transliteration` and `translation` while keeping verse‑level timings.

Where it’s orchestrated
- `useSongDataManager` calls `fetchSongDataFromGemini` on upload or language change.
- `App.tsx` manages model selection. When the model changes and a song is present, it triggers re‑processing.

Common errors and remedies
- “Gemini API client is not initialized”: API key missing or not yet resolved. Set it in `.env.local` or environment.
- “Model ID not provided”: Ensure a model is selected in the UI (`ModelSelector`).
- “Failed to parse AI response as JSON”: Tighten prompts, reduce complexity, or retry. The agent logs a 10KB response preview and precise context around parse failures.
- Instrumentals: The agent returns `originalLanguage: "Instrumental"` and an empty `verses` array, with minimal song‑level fields.

---

## Singing Coach Agent

Purpose
- Score and coach a user’s recorded singing for selected verses using pronunciation, timing, and clarity dimensions.

Entrypoint
- `fetchSingingFeedback(audioBlob, referenceVerses, targetLanguage, modelId)` in `services/geminiService.ts`

Inputs
- `audioBlob`: Browser `Blob` from `MediaRecorder` (Opus/WebM preferred)
- `referenceVerses: Verse[]`: Typically the subset the user recorded
- `targetLanguage`: Used to tailor pronunciation guidance in the prompt
- `modelId`: Same selection mechanism as the Song Analysis Agent

Outputs
- `SingingScore` (see `types.ts`):
  - `overallScore` and dimension scores (`pronunciationAccuracyScore`, `timingAlignmentScore`, `vocalClarityScore`)
  - `feedback`: positive points and improvement areas
  - `verseScores[]`: a parallel list by `verseNumber` with per‑verse detail
  - Optional `userAttemptTranscription` (overall and/or per‑verse)

Flow
1. Audio preparation: Blob is converted to base64 inline data.
2. Prompting: `getSingingFeedbackPrompt` includes:
   - Verse‑by‑verse transliterated references (phonetic text)
   - Relative phrase timings (derived from `transliterationSegments`, when available) normalized to start at 00:00.000
   - Clear rubric: focus on pronunciation/timing/clarity (no pitch judging)
3. Generation: Uses strict response schema via `getSingingFeedbackResponseSchema()` and `responseMimeType: 'application/json'`.
4. Parsing/validation: JSON parse and basic shape checks for required fields and arrays.
5. Persistence: A successful attempt is stored in IndexedDB (`PracticeAttempt`) with blob, scores, verse numbers, and timing.

Where it’s orchestrated
- `useSingingPractice` manages:
  - Earphone consent and microphone permissions
  - Recording lifecycle via `MediaRecorder`
  - Cut points for which verses were actually attempted
  - Submission to Gemini and saving the `PracticeAttempt`
- `LibraryView` can display past practice attempts, play back recordings, and show detailed score breakdowns.

Common errors and remedies
- Microphone permission errors: Use the device configuration UI to grant permission and select a valid input device.
- “AI Model not selected for scoring”: Ensure a model is chosen prior to practice.
- JSON parse/shape errors: tighten prompt or temporarily reduce the number of verses included in a single attempt.

---

## Model Selection and Configuration

- All selectable models are defined in `constants.ts` under `AVAILABLE_MODELS` with `id`, `name`, and `description`.
- `DEFAULT_MODEL_ID` controls the initial selection (the app currently defaults to a Pro model override).
- The `ModelSelector` component binds to `App.tsx` state; changing the model triggers a re‑process on the next action (e.g., language change) if a song is loaded.

Adding or changing models
1. Update `AVAILABLE_MODELS` with a new `{ id, name, description }`.
2. Optionally update `DEFAULT_MODEL_ID`.
3. No UI changes required—the selector renders dynamically from the list.

---

## Data Contracts (types)

Defined in `types.ts`:
- `Language`: enum of supported UI target languages.
- `SongData` and `Verse`: core content used by the UI.
- `PracticeAttempt` and `SingingScore`: practice recording and scoring artifacts.
- Karaoke mode segment types (`TransliterationSegment`, `TranslationSegment`) carry per‑phrase `startTime`/`endTime` in seconds (normalized from `MM:SS.sss`).

Normalization rules (`services/verseParser.ts`)
- Accepts both `MM:SS` and `MM:SS.sss` from the model; converts to seconds.
- Enforces a minimum segment duration for highlighting.
- Sorts verses by start time and assigns sequential `verseNumber` after sorting.
- Provides fallbacks if segments are missing or types are misaligned.

---

## Privacy and Data Flow

- The uploaded audio file is sent to Gemini for processing and returned results are displayed in the client.
- Saved songs and practice attempts are stored client‑side in IndexedDB (`db.ts`).
- Practice recordings remain local unless the user loads them; they are saved in the browser along with scores.
- Review Google Gemini’s data handling policies for production deployments.

---

## Async Download to GCS (Webhook + SSE on Vercel Edge)

Purpose
- Store a downloaded song in Google Cloud Storage (GCS) via a Python worker and return the final URL to the client in real time using Server‑Sent Events (SSE).

Architecture
- Job start (client → Hono): Client posts a download request to Hono (running on Vercel Edge). Hono creates a `jobId`, persists `queued` status, and returns `statusUrl` and `eventsUrl` (SSE).
- Work (Python): A Python service downloads the source, uploads to GCS (resumable), derives a public or signed URL.
- Callback (Python → Hono webhook): Python posts the result to Hono with an HMAC‑signed payload. Hono verifies, updates job state, and publishes an event.
- Notify (Hono → client via SSE): The client listens on `eventsUrl` to receive `progress` and a final `completed` or `failed` event with the URL.

Endpoints (Hono)
- `POST /api/downloads`
  - Body: `{ sourceUrl, filename?, mime? }`
  - Returns: `{ jobId, statusUrl, eventsUrl }`
  - Side effect: enqueue work by calling the Python uploader or publishing to a queue with `{ jobId, sourceUrl, callbackUrl }`.
- `GET /api/downloads/:id`
  - Returns: `{ status: 'queued'|'working'|'completed'|'failed', url?, gcsObject?, error? }`.
- `GET /api/downloads/:id/events` (SSE)
  - Streams events: `progress`, `completed`, `failed`. Includes `id:` and optional `retry:` for resume.
- `POST /api/downloads/:id/callback` (webhook)
  - Headers: `X-Job-Id`, `X-Signature` = HMAC‑SHA256 of raw body with `CALLBACK_SECRET`.
  - Body: `{ status: 'completed'|'failed', url?, gcsObject?, mime?, size?, error? }`.
  - Behavior: verify HMAC, upsert status, publish SSE update, return 200. Idempotent per `jobId`.

State and fan‑out
- Use a durable store (e.g., Upstash Redis via Vercel KV) for job records: `downloads:{jobId}` with a 24–48h TTL.
- For cross‑instance event delivery, publish to a channel `downloads:events:{jobId}`. The SSE handler subscribes and forwards messages to the client.
- On client reconnect, serve the latest persisted state immediately, then continue streaming.

Vercel Edge specifics (Hono)
- Streaming: set `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-store`, and periodically send heartbeats (e.g., `:ping\n\n`) every 15–30s to avoid idle timeouts.
- Do not rely on in‑memory connection maps for delivery; serverless instances are ephemeral. Use Redis pub/sub (REST Channels) or similar to reach whichever instance holds the SSE.
- Use Web Crypto for HMAC verification (Edge runtime): compute HMAC over the raw request body before JSON parsing.
- Keep the SSE handler simple: write initial `ready` event, emit heartbeats, proxy pub/sub messages, and close cleanly on abort.

Python worker responsibilities
- Download source and upload to GCS with a service account. Prefer resumable uploads for large files.
- Decide URL strategy:
  - Private object: generate a signed URL with a TTL (recommended for access control).
  - Public object: return the public URL and set appropriate `Cache-Control`.
- Callback payload example:
  - `{ status: 'completed', url, gcsObject: { bucket, path, contentType, size } }` or `{ status: 'failed', error: { code, message } }`.
- Reliability: retry webhook on 5xx/timeout with exponential backoff; stop on 2xx.

SSE vs polling (quick take)
- SSE pros: low latency push, fewer requests, ordered delivery, simpler than WebSockets.
- SSE cons: long‑lived connections, infra idle limits, needs pub/sub to scale across instances.
- Polling pros: stateless, CDN‑friendly, works under strict mobile/background limits.
- Polling cons: higher cost or higher latency, thundering herd, stepped progress UX.
- Recommendation: use SSE as primary; implement a 5–10s backoff polling fallback if SSE drops.

Environment variables
- `GCS_BUCKET`, `GCS_SIGNED_URL_TTL_SECONDS` (or `GCS_PUBLIC=true`)
- `CALLBACK_SECRET` (HMAC for webhook)
- `REDIS_URL`, `REDIS_TOKEN` (Upstash Redis/REST Channels)
- `PYTHON_UPLOADER_URL` (if invoking worker via HTTP)
- `BASE_URL` (to compose `callbackUrl` for the worker)

Event shapes (examples)
- `event: progress` → `data: { percent: 42 }`
- `event: completed` → `data: { url, gcsObject }`
- `event: failed` → `data: { error: { code, message } }`

Sequence (end‑to‑end)
1. Client → Hono `POST /api/downloads` → `{ jobId, statusUrl, eventsUrl }`.
2. Hono enqueues work for Python with `callbackUrl` including `jobId`.
3. Python uploads to GCS, creates URL, POSTs webhook with HMAC.
4. Hono verifies, persists status, publishes to `downloads:events:{jobId}`.
5. SSE endpoint pushes `completed` (or `failed`) to the client and closes.

---

## Extending the Agents

Add a new target language
1. Add the enum value in `types.ts` and include it in `SUPPORTED_LANGUAGES` in `constants.ts`.
2. Update `getTransliterationScriptInstruction` if the new language needs a special transliteration rule.

Add a new scoring dimension
1. Extend `getSingingFeedbackResponseSchema` and `types.ts` to include the new fields.
2. Update UI renderers such as `ScoreDisplay` to visualize it.

Tune prompts
- Prefer incremental, surgical changes to `services/prompts.ts`.
- Keep schema and prompt in sync; when expanding output shape, update the schema first.

Swap providers or add multi‑provider support
1. Create a new service module with the same function shapes (`fetchSongDataFromGemini`, `fetchSingingFeedback`).
2. Add a provider switch in configuration and thread it through hooks as needed.

---

## Troubleshooting

- API key missing: Set `GEMINI_API_KEY` (or `API_KEY`/`VITE_GEMINI_API_KEY`) and reload. See `useAppInitializer`.
- Model changed but no re‑process: Change language or re‑upload to trigger processing; the app logs the change and reprocesses when appropriate.
- Lyrics out of sync: Ensure Karaoke Mode was enabled at processing time; the mode affects the shape of the returned data.
- JSON parse failures: Check console logs for the 10KB response preview and context window; reduce scope or adjust prompts.
- Microphone issues: Use the Device Configuration panel to request permissions and pick a valid input device.

---

## Quick Reference

- Analyze song: `useSongDataManager.handleAudioSubmit` → `geminiService.fetchSongDataFromGemini`
- Re‑analyze on language change: `useSongDataManager.handleLanguageChange`
- Record practice: `useSingingPractice.startRecording` / `.stopRecording`
- Score practice: `useSingingPractice.submitForScoring` → `geminiService.fetchSingingFeedback`
- Save song: `addSongToLibrary` (IndexedDB)
- Save practice: `addPracticeAttemptToDB` (IndexedDB)
- Start async download: `POST /api/downloads` (returns `jobId`, `eventsUrl`)
- Receive updates: `GET /api/downloads/:id/events` (SSE: `progress` → `completed`/`failed`)
- Worker callback: `POST /api/downloads/:id/callback` (HMAC‑signed)

This document focuses on the agent responsibilities and their integration points so contributors can safely evolve prompts, schemas, and model choices without breaking the UX.
