# Babelback audit findings

Audit of `audit/2026-11` (last commit 13bc12a), 2026-11-03. This was a read-only review: no source edits and no calls to Apify, Gemini, GCS or Redis. Env vars are named but no values appear. The migration plan is in [plan.md](plan.md).

Format: `file:line` | severity | tag | what is wrong and the evidence. Tags: `fix` (keep and repair), `delete`, `replaced-by-migration` (no fix proposed, because the migration replaces the code). `unverified` marks claims that depend on production state we could not see.

## Summary

77 findings: 13 high, 21 med, 43 low.

- **The worst problems are open endpoints on the live app.**
  - `/api/media` signs any object in any bucket the service account can read, for up to 7 days.
  - `/api/song-analysis` fetches any URL from the server (SSRF) and trusts a client-supplied cache key.
  - Neither route nor `/api/downloads` has auth or rate limits, so anyone can spend our Gemini and Apify budget.
- **The job state in Redis is unreliable.** Each instance reads its own memory first and writes with read-merge-write, so status can go stale or backwards between instances.
- **The analysis route has three live bugs.** It calls the prompt and verse parser with the wrong arguments, so karaoke segments are always dropped. It never validates Gemini's output. The build hides all of this by ignoring type errors.
- **Answers to the brief's questions:**
  - Singing feedback is **broken** in production. The client posts to `/api/singing-feedback`, which is not a `route.ts` and returns 404. Practice mode exists only on the unlinked legacy page `/song-explorer`.
  - `/api/proxy` is **dead**. The fallback that calls it always 404s.
- **The brief's "already found" list is confirmed, with corrections:**
  - `App.tsx` is live (the root layout renders it). Only `index.tsx` and `index.css` are Vite leftovers.
  - The `services/` copies of `prompts` and `verseParser` are unreachable and have drifted from the server copies.
  - Only the Apify actor of the three downloaders is used.
  - Redis also holds the only server copy of analyses and the Apify tokens.
  - The committed PNGs total about 2.4 MB, not 2.2 MB.

### Check results

Run in a clean copy with Node 26.11.0 and npm 11.20.0, with no `.env*` files present.

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | 704 packages. npm 11 skipped install scripts for `@tailwindcss/oxide`, `fsevents`, `sharp` |
| `npx tsc --noEmit` | 2 | 1 syntax error in `backups/MobileSongExplorerPrototype.tsx:1025` stops type checking. Without `backups/`: 69 errors in 35 files, 29 unused names and 40 real type errors |
| `npm run lint` | 1 | No ESLint config. `next lint` opens its interactive setup prompt |
| `npm test` | 1 | Jest: 7 suites (2 failed), 16 tests (4 failed: `BasicView`, `AdvancedView`) |
| `npm run build` | 0 | Passes only because `next.config.mjs` ignores type and lint errors. Route table lists only the 8 `route.ts` API routes |
| `npm audit --omit=dev` | 1 | 30 advisories: 3 critical, 17 high, 9 moderate, 1 low. The criticals are in `next@15.2.4` |

## Security and cost

- `app/api/media/route.ts:34` | high | fix | Open signing oracle. `bucket` and `path` come straight from the query string with no allowlist. Anyone can mint a read URL for any object the service account can read, in any bucket, for up to 7 days (`:29`). `mode=download` (`:80-88`) streams the bytes through our server with `Access-Control-Allow-Origin: *` and `Cache-Control: public`. No auth. The endpoint survives the migration in a new form (`GET /v1/media/:assetId`), so the stopgap belongs in P0.
- `app/api/song-analysis/route.ts:289` | high | replaced-by-migration | SSRF. `audioUrl` is any client string. The server fetches it with `redirect: 'follow'` (3 tries, 20 s each) and sends the body to Gemini. On Railway this could reach private-network services, and on any host it reads arbitrary URLs. There is no size cap: `resp.arrayBuffer()` (`:292`) buffers the whole response.
- `app/api/song-analysis/route.ts:61` | high | replaced-by-migration | Cache poisoning. The client-supplied `gcsObject` is trusted as the cache key (`:207`, key built in `app/api/_lib/analysisCache.ts:95-104`). Nothing checks that the analysed audio is that object or that the bucket is ours. One request can store any analysis under another song's key for 30 days (`:399`), and every later user gets it.
- `app/api/downloads/route.ts:59` | high | replaced-by-migration | No auth, no rate limit and no URL validation on the most expensive route. Any string is accepted as `youtubeUrl` (`:37`, `:49`). Each call starts an Apify run on the RESIDENTIAL proxy (`:169-171`). Body values `maxDurationSeconds` and `maxFileSizeBytes` override the server caps `APIFY_MAX_*` (`:184-195`), and `country` is client-chosen (`:40-42`).
- `app/api/song-analysis/route.ts:204` | high | replaced-by-migration | No auth or rate limit on Gemini spend. The model is client-chosen: `resolveModelId` returns any non-empty `modelId` verbatim (`app/api/_lib/gemini/index.ts:26-27`), so a caller can run any model on our key.
- `app/api/downloads/[id]/callback/route.ts:9` | high | delete | Unauthenticated job writes when `CALLBACK_SECRET` is unset, because `verifyHmac` returns true.
  - The body can set any `status` string (`:37`) and replace the job's `url` with any URL (`:38`), which the client then plays.
  - Nothing calls this route: `app/api/downloads/route.ts:176-195` never passes `callbackUrl` to the actor, though the actor supports it (`actors/yt-audio-basic/main.js:10-13`).
  - `unverified`: whether `CALLBACK_SECRET` is set in prod, and whether an Apify account's `inputDefaults` in Redis injects a `callbackUrl`.
- `package.json:61` | high | fix | `next` is pinned to 15.2.4. `npm audit` lists critical advisories, including "Next.js is vulnerable to RCE in React flight protocol" and image-optimizer RCEs, plus about 13 high DoS, SSRF and middleware-bypass advisories. 15.5.x fixes them within the same major. This applies until the Next app is retired.
- `app/api/uploads/audio/route.ts:9` | med | replaced-by-migration | No auth, no size limit and no content-type allowlist. The client's `Content-Type` is stored as-is (`:19`). Objects under `uploads/` are never deleted.
- `gcp/ytdlp-function/deploy.sh:35` | med | delete | The Cloud Function is deployed `--allow-unauthenticated`. `main.py:33` downloads any URL yt-dlp supports, with `nocheckcertificate` (`:50`), into our bucket and returns a signed URL. The app never calls it. `unverified`: whether it is still deployed. If it is, it is an open downloader on our GCP bill.
- `app/api/_lib/apifyAccounts.ts:62` | med | replaced-by-migration | Apify tokens are stored as plaintext JSON in Redis (`apify:accounts`, written by `scripts/manage-apify-accs.ts`). Anyone with Redis access has every token.
- `app/api/downloads/route.ts:166` | low | replaced-by-migration | The Apify token is sent as a `?token=` query parameter, here and in `app/api/downloads/[id]/route.ts:86`. Apify accepts `Authorization: Bearer`, which keeps tokens out of URLs.
- `app/api/downloads/route.ts:38` | low | replaced-by-migration | `audioFormat` is any string cast to `'m4a' | 'mp3'`, interpolated into the object path (`:89`) and passed to the actor.
- `app/api/_lib/gemini/index.ts:19` | low | replaced-by-migration | Logs the length of `GEMINI_API_KEY` on every cold start. No value is printed.

## Gemini contract and validation

- `app/api/song-analysis/route.ts:142` | high | fix | The live route calls `parseSongVerses(raw.verses)` with 1 of its 3 required arguments, so `enableKaraokeMode` and `targetLanguage` arrive as `undefined`. Word-level karaoke segments are always discarded, and missing-translation fallbacks read "Translation to undefined not provided by AI." Only `ignoreBuildErrors` hides this (TS2554). The parser and prompts are ported in P1, so fix them there or in P0.
- `app/api/song-analysis/route.ts:106` | high | fix | `getSongAnalysisUserPromptText(targetLanguage, enableKaraokeMode)` passes the boolean as `audioFileName` and leaves `enableKaraokeMode` undefined. Line 99 also leaves `audioFileName` out of the system prompt. The two prompts can disagree about karaoke mode, and the filename hint reads "true", "false" or "undefined".
- `app/api/song-analysis/route.ts:134` | high | fix | Gemini output is not validated. The route asks for free text (no `responseMimeType` or `responseSchema`), slices from the first `{` to the last `}`, and casts `JSON.parse(...) as RawSongData`. The dead `app/api/song-analysis.ts:255` did send a `responseSchema`; the move to `route.ts` dropped it. `zod` 3.25.67 is installed and unused.
- `app/api/song-analysis/route.ts:337` | med | fix | `responseModalities: [Type.OUTPUT_TEXT]` is passed at the top level of `generateContent`, not in `config`, and `Type.OUTPUT_TEXT` does not exist, so it sends `[undefined]` (TS2353, TS2339, hidden by `ignoreBuildErrors`).
- `app/api/song-analysis/route.ts:34` | med | fix | The song contract exists in three hand-copied versions: `types.ts:22-39` (client), the route-local `SongData` here, and `Verse` in `app/api/_lib/verseParser.ts:4`. `Language` is duplicated too, in `types.ts:1` and `app/api/_lib/prompts.ts:1`. The fields match today, but nothing keeps them in sync. One shared zod schema should replace all of them (plan P1 item 6).
- `app/api/song-analysis/route.ts:103` | med | replaced-by-migration | Audio goes to Gemini as inline base64. Gemini caps inline request data at about 20 MB, so long or high-bitrate songs fail; the Files API avoids this. No route exports `maxDuration`, so the Vercel function timeout applies to a call that can take a minute or more (`unverified` for the current plan).
- `services/geminiService.ts:153` | med | replaced-by-migration | The client trusts the server response. It only checks that `songData.verses` exists (`:153`, `:215`) and that `singingScore.verseScores` is an array (`:253`), then casts.
- `app/api/_lib/analysisCache.ts:153` | low | replaced-by-migration | Cached analyses are read back from Redis with `JSON.parse(raw) as AnalysisCacheRecord` and no validation.
- `app/api/singing-feedback.ts:237` | low | replaced-by-migration | Dead file: `JSON.parse(cleanedText) as SingingScore` after a `responseSchema` request. Port the schema, not the cast.

## Job pipeline and data

- `app/api/_lib/jobStore.ts:112` | high | replaced-by-migration | Stale reads across instances. `getJob` returns the in-memory copy first and never re-reads Redis. A warm instance keeps serving the state it last saw while other instances write newer state. Combined with the next finding, status can go backwards.
- `app/api/_lib/jobStore.ts:143` | med | replaced-by-migration | `updateJob` is read-merge-write with no lock, version or compare-and-set.
  - One status poll can write up to five times (`app/api/downloads/[id]/route.ts:94`, `:97`, `:110` or `:121`, `:154`, `:167`). Concurrent polls overwrite each other, and the last write wins.
  - `metricsSent` (`:165-168`) has the same race, so `download_complete_server` can fire twice.
- `app/api/downloads/route.ts:104` | med | replaced-by-migration | Dedup race. `getJobIdBySource` followed by `putJob` and `setJobIdForSource` (`:138-139`) is not atomic, so two clicks start two Apify runs. The key is the raw URL string (`jobStore.ts:155`), so `youtu.be/x` and `youtube.com/watch?v=x&t=1` count as different jobs.
- `app/api/_lib/redis.ts:53` | med | replaced-by-migration | One connect failure (1 s timeout, `:33`) sets `disabled = true` for the life of the instance. After that, `putJob` keeps jobs in memory only, because `jobStore.ts:103-105` swallows the error. The analysis cache also turns off. Nothing alerts.
- `app/api/downloads/[id]/route.ts:51` | med | replaced-by-migration | An unknown job id returns `{status: 'queued'}` with 200 forever. A lost job (evicted, past the 48 h TTL in `jobStore.ts:31`, or Redis disabled) therefore makes the client poll for 15 minutes before failing.
- `app/api/downloads/[id]/route.ts:84` | med | replaced-by-migration | Every status poll (every 4 s per user) calls the Apify API, then GCS `exists` and `getMetadata`, and signs a URL (`:58-74`, `storage.ts:124-141`). After completion it re-signs on every poll (`:151`). Cost and latency scale with users times poll rate.
- `app/api/downloads/[id]/callback/route.ts:40` | med | delete | The callback replaces `gcsObject` with `{contentType, size}` (shallow merge, `jobStore.ts:146`) and drops `bucket` and `path`. After that, `signCurrentObject` (`app/api/downloads/[id]/route.ts:58-59`) can never sign the file. Moot once the route is deleted.
- `app/song-explorer/page.tsx:390` | med | replaced-by-migration | YouTube songs lose their audio in the library.
  - The legacy page saves them with an empty 0-byte `File` (`:398`) and no storage reference.
  - The linked explorer never saves YouTube songs at all (`src/features/song-explorer/controller/useSongExplorerController.ts:95-120`).
  - Seeds are saved with an empty `File` when buffering failed (`useSongExplorerController.ts:198`).
  - The signed URL that was playing expires after 2 h (`storage.ts:156`).
- `app/api/downloads/route.ts:95` | low | replaced-by-migration | Signed write and read URLs are minted before the dedup check, so cache hits waste two signing calls.
- `app/api/downloads/[id]/route.ts:117` | low | replaced-by-migration | The `SUCCEEDED` branch (`:118-133`) and the `else` branch (`:134-149`) are identical. Completion is inferred from "the object exists", whatever Apify reports.
- `app/api/seeds/[cacheKey]/route.ts:44` | low | replaced-by-migration | If signing fails, `audioUrl` falls back to `record.youtubeUrl`, which is a web page, not audio, so the player fails silently.
- `app/api/_lib/jobStore.ts:42` | low | replaced-by-migration | Every Redis get or set logs 2-4 lines (in `jobStore.ts`, `redis.ts` and `analysisCache.ts`), so one status poll produces about 20 log lines.

## Build, types and tooling

- `next.config.mjs:12` | high | fix | `typescript.ignoreBuildErrors: true`, and `eslint.ignoreDuringBuilds: true` on line 9. Production builds ship with 40 real type errors, several of them live bugs (see the Gemini section).
- `backups/MobileSongExplorerPrototype.tsx:1025` | med | delete | Syntax error in a 48 KB backup that tsconfig's `**/*.tsx` include picks up. It masks every other error from `npx tsc --noEmit`. Delete `backups/`.
- `package.json:9` | med | fix | `"lint": "next lint"` has no ESLint config behind it and only opens a setup prompt. `next lint` is also deprecated in Next 15.5+.
- `scripts/recover-job.ts:35` | med | replaced-by-migration | Calls `makeStorage`, which is not defined or imported anywhere, so `npm run recover-job` throws a ReferenceError.
- `app/layout.tsx:19` | low | fix | `cookies()` is async in Next 15 but used synchronously. It works through Next's compatibility shim with a warning and breaks on Next 16. This only matters if the app moves to Next 16 before it is retired. `unverified` at runtime.
- `app/api/media/route.ts:85` | low | replaced-by-migration | `expiresIn` is typed as possibly undefined at 85, 92, 100 and 109. Type-only: the parser always sets it.
- `app/api/downloads/[id]/route.ts:52` | low | replaced-by-migration | `string | undefined` is assigned to `string` at 52, 126, 127, 142 and 143. Type-only.
- `app/api/_lib/apifyAccounts.ts:27` | low | replaced-by-migration | The account config shape and the type predicate (`:44`) disagree.
- `scripts/seed-manager.ts:24` | low | fix | The `GCSObject` type is not imported (also line 55). Type-only; the script still runs under tsx.
- `app/api/seeds/route.ts:47` | low | replaced-by-migration | Reads `songData.artist`, which `SongData` does not have, so it always falls back to `record.artist`.
- `app/song-explorer/page.tsx:700` | low | replaced-by-migration | `AboutPage`, `TechDetailsPage` and `ChangelogPage` are rendered without the required `onNavigateBack` (700, 705, 710), so their back buttons call undefined.
- `hooks/useSingingPractice.ts:1` | low | replaced-by-migration | 56 uses of `any` across 25 files. The top files are this hook (4), `app/api/song-analysis.ts` (4, dead), `src/features/song-explorer/setup/SetupView.tsx` (3) and `app/api/uploads/audio.ts` (3, dead). There is no `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck`. The real problem is ignored build errors, not `any`.
- `package.json:41` | low | fix | `@radix-ui/react-slider` is pinned to `latest` (the lockfile resolves 1.3.6).
- `package.json:49` | low | fix | `@vercel/analytics` is pinned to `latest` (lockfile 1.5.0). It goes away when Vercel Analytics is dropped.
- `package.json:21` | low | delete | Unused dependencies. P0 item 5 removes the first group; P0 item 1 removes the second along with the unreachable `components/ui/` files.
  - Not imported by any file outside `components/ui/`: `@hookform/resolvers`, `autoprefixer`, `date-fns`, `geist` and `tailwindcss-animate`. `zod` is in the same state but should stay, because it becomes the contract.
  - Imported only by unreachable `components/ui/` files: most `@radix-ui/*` packages, `cmdk`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts`, `sonner` and `vaul`.
  - Keep `next-themes` while `App.tsx` is live.

## Broken features and dead routes

- `services/geminiService.ts:245` | med | replaced-by-migration | Practice scoring is broken in production.
  - `hooks/useSingingPractice.ts:207` posts to `SINGING_FEEDBACK_ENDPOINT = '/api/singing-feedback'` (`:17`), and the legacy page `app/song-explorer/page.tsx:179` wires that hook in.
  - `app/api/singing-feedback.ts` is a Pages-Router handler (`NextApiRequest`, `:5`, `:133`) inside `app/`, which the App Router never serves. It is absent from the build route table. Every request gets Next's 404 HTML, which the user then sees as the error text.
  - It has been unserved since the Next.js scaffold commit `baa6179`.
  - Nothing links to `/song-explorer` (every link goes to `/song-explorer/responsive`), so practice mode is reachable only by typing the URL.
  - The rewrite treats practice as a new feature (plan P1 item 7).
- `services/geminiService.ts:193` | med | delete | The `/api/proxy` fallback in `fetchSongDataFromUrl` always 404s, because `app/api/proxy.ts` is unserved. It only adds a failed request before the original error appears. Had it run, `:198` would throw a RangeError on multi-MB files by spreading the whole buffer into `String.fromCharCode`. Do not revive `proxy.ts`: it is an unauthenticated fetch-and-relay with `Access-Control-Allow-Origin: *`.
- `app/api/song-analysis.ts:103` | med | delete | An unserved older copy of `app/api/song-analysis/route.ts` (367 lines against 448) that has drifted. These are unserved Pages-Router handlers under `app/` too: `app/api/{echo,health,proxy,singing-feedback,upload}.ts`, `app/api/metrics/debug.ts` and `app/api/uploads/audio.ts`. Brief item confirmed.
- `components/TechDetailsPage.tsx:91` | low | delete | `EchoTester`, rendered on the legacy page's tech-details tab, calls `/api/echo`. That route is unserved, so the tester always fails.
- `hooks/useSongDataManager.ts:85` | low | replaced-by-migration | `isKaraokeMode` defaults to false, and the linked explorer has no toggle (`components/KaraokeModeToggle.tsx` is unreachable). Karaoke mode is unreachable from the UI as well as broken on the server.
- `App.tsx:1` | low | fix | Correction to the brief: `App.tsx` is not a Vite leftover. `app/layout.tsx:7,39` wraps every page in it (ThemeProvider plus Vercel `<Analytics />`). Fold it into the layout when analytics changes.

## Vercel coupling

- `app/api/uploads/audio/route.ts:25` | high | replaced-by-migration | The upload path assumes there is no body limit ("no vendor limits", `services/geminiService.ts:73`). Vercel Functions cap request bodies at 4.5 MB, and this route buffers the whole body with `req.arrayBuffer()`. Typical 4-10 MB songs fail, and the client then refuses the base64 fallback above 2 MB (`services/geminiService.ts:127-131`). File upload therefore likely fails for most real songs in prod (`unverified` against live traffic).
- `App.tsx:2` | low | replaced-by-migration | `@vercel/analytics` is mounted in the root wrapper and again in `app/song-explorer/page.tsx:975`, so that page reports twice.
- `app/api/_lib/jobStore.ts:35` | low | replaced-by-migration | A second KV backend: Vercel KV REST (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) is used when `REDIS_KV_REDIS_URL` is unset. `REDIS_KV_REDIS_URL` itself follows the Vercel Marketplace Redis naming.
- `services/geminiService.ts:9` | low | delete | `upload` from `@vercel/blob/client` is imported and never called. The catch block at `:124` still keys its base64 fallback on Blob error text (`BLOB_READ_WRITE_TOKEN`).
- `scripts/vercel-env-import.sh:1` | low | replaced-by-migration | Pushes `.env.local` into Vercel envs. Replaced by Railway service variables. The committed `.vercel/` folder is listed under Repo junk.
- `app/api/_lib/loadEnv.ts:5` | low | replaced-by-migration | Every route imports a runtime `dotenv` loader, and `app/api/_lib/gemini/index.ts:4` loads `.env.local` again. Next already loads env files, and on Railway the env comes from the service.

## Downloaders

- `gcp/ytdlp-function/main.py:30` | med | delete | Unused by the app; `BUCKET_NAME` is its own env var. See Security for the open deployment (`deploy.sh:35`).
- `actors/yt-audio-basic/main.js:1` | low | replaced-by-migration | The only downloader the app uses (`POST /api/downloads` starts it through Apify). It supports `callbackUrl`, HMAC and a key-value-store fallback, none of which the app wires up. The header comment (`:9-13`) still describes a "Hono (Edge)" caller that was never built. Keep or replace it per plan decision 4.1.
- `workers/ytdlp-worker/src/__pycache__/ytdlp_runner.cpython-313.pyc:1` | low | delete | The whole worker is 3 committed `.pyc` files with no source. The only references are `PYTHON_UPLOADER_URL` mentions in `docs/AGENTS.md:230` and `docs/DESIGN.md:316`.

## Dead code and duplicates

- `app/api/_lib/telemetry.ts:1` | low | delete | A reachability walk from every `page`, `layout` and `route` file finds these unreachable:
  - `app/api/_lib/{telemetry,downloadJobs}.ts`. `downloadJobs.ts` is an in-memory duplicate of the types and functions in `jobStore.ts`.
  - `hooks/useDownloadJob.ts`.
  - `components/{AudioUpload,KaraokeModeToggle,ModelSelector,PanelToggle,PlayerBar,PlayerControls,PracticeModeToggle,SeedLibraryView,TabsBar,VerseDisplay,YouTubeInput}.tsx`.
- `components/ui/accordion.tsx:1` | low | delete | 45 of the 57 shadcn files in `components/ui/` are unreachable (from accordion to tooltip), plus `hooks/use-mobile.ts` and `hooks/use-toast.ts`. The UI rewrite replaces the rest.
- `services/prompts.ts:1` | low | delete | Unreachable. The server uses `app/api/_lib/prompts.ts`. The copies have drifted (135 lines against 125, with different Latin-script transliteration rules).
- `services/verseParser.ts:1` | low | delete | Unreachable. The server uses `app/api/_lib/verseParser.ts`. The copies have drifted (180 lines against 127; the server copy adds a verse-shape guard).
- `index.tsx:1` | low | delete | The Vite entry (`ReactDOM.createRoot`). Nothing imports it, and it fails type checking (missing `children` for `App`).
- `index.css:1` | low | delete | Only `dist/index.html:146` references it. Also unused: `src/index.css`, `styles/globals.css` and `tailwind.config.js`. Tailwind v4 runs through `@tailwindcss/postcss` with no `@config`, so the v3 config and its `tailwindcss-animate` plugin are ignored.
- `app/api/seeds/route.ts:30` | low | delete | Its only caller, `components/SeedLibraryView.tsx:52`, is not mounted by any page. `app/api/seeds/[cacheKey]/route.ts` is live (`useSongExplorerController.ts:231`).
- `components/VerseDisplay.tsx:261` | low | delete | Reads `literalTranslation`, which neither `Verse` nor `PanelVisibility` has. The component is unreachable anyway.

## Repo junk

- `dist/index.html:1` | low | delete | Vite build output is committed (`dist/`, 304 KB).
- `.vercel/project.json:1` | low | delete | `.vercel/` is committed (36 KB: project link, README, 7 build-cache tsconfigs for the old `api/*.ts`), even though `.gitignore` lists `.vercel`. The project and org ids are not secrets.
- `bb-logo.png:1` | low | delete | 1.4 MB, unreferenced. So are `ssbb.png` (744 KB), `public/images/design-mode/bb-logo.png` (236 KB) and `public/placeholder*.{png,jpg,svg}`: about 2.4 MB in total. `.gitignore` ignores `*.png`, but these were committed before the rule.
- `log.txt:1` | low | delete | 34 bytes ("Micro started"), no secrets.
- No secret values are in tracked files. A pattern scan for Gemini keys, private keys, Apify tokens and Redis URLs with passwords found nothing.

## Tests

- `src/features/song-explorer/views/__tests__/BasicView.test.tsx:18` | low | replaced-by-migration | The tests expect a +/-2-verse window (5 items) and a relative click index. The components now render every verse (10 items), so 4 tests fail (`BasicView.test.tsx:18,50`, `AdvancedView.test.tsx:24,50`). These are stale tests for UI the rewrite replaces. No test covers the API, the parser or the job pipeline.
