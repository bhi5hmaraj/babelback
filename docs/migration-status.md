# Migration Status & Debug Reference

_Updated: 2025-10-18_

## Seed & Library Flow

- **Try These → Explorer:** Seeds now load through `useSongExplorerController.ingestSeedPayload`, which buffers the full audio via `/api/media?mode=download` before hydrating lyrics. Seeking is instant and playback uses an object URL.
- **Explorer Loading Screen:** The parchment loading card shows buffering progress (`seedBufferingPercent`). If buffering stalls, watch for `[seed] buffer:` logs.
- **Library Entries:** Seed loads write real audio blobs into IndexedDB (`BabelbackLibraryDB.songs`). Delete and re-load seeds saved prior to 2025-10-18 for working playback.
- **Seed manifest:** `/api/seeds` now reads exclusively from `data/seed-songs.json`. Update seeds with `npm run seed -- add <jobId>` and commit the file when deploying.
- **Media Endpoint:** `/api/media` supports `mode=json` (signed URL) and `mode=download` (same-origin stream). Client code now uses download mode to avoid CORS.

## Outstanding Migrations / Follow-ups

| Area | Status | Notes |
| --- | --- | --- |
| Promote `SongExplorerScreen` to main routes | 🔄 (babelback-108) | Flip default routes when responsive screen finishes QA.
| Remove legacy prototype | 🔄 (babelback-109) | Cleanup once new screen is primary.
| Integrate tabs/footer into legacy screen | 🔄 (babelback-106, babelback-107) | Needed only if legacy screen persists during migration.
| Automate mobile seed regression | 🔄 (babelback-3) | Expand Playwright smoke into full regression.
| Archive mobile prototype | ✅ | `components/song-explorer-mobile/MobileSongExplorerPrototype.tsx` removed from build; keep local copy if needed for reference.

## Debugging Cheat Sheet

```ts
import { dbg, dberr } from '@/lib/debug'
```

- Enable logs server-side by setting `BB_DEBUG_DEFAULT=1` (or `NEXT_PUBLIC_BB_DEBUG_DEFAULT=1`). Root layout seeds `localStorage` and cookie `bb_debug=1` automatically.
- Client toggle: `localStorage.setItem('bb:debug', '1')`; disable via `localStorage.removeItem('bb:debug')`.
- Notable tags:
  - `[seed] ingest/start/analyze/buffer`
  - `[library] added/refresh`
  - `[screen] seed:detected/loaded`
  - `[media] request/signed url`.

## Known Quirks

- `/api/media` requires valid GCP credentials. Without them the endpoint returns 500; seeds load without caching.
- Buffer progress depends on `Content-Length`. If missing, percentage may stay 0 until buffering completes.
- Object URLs aren’t revoked yet; consider revoking when clearing songs to avoid leaking blobs.
