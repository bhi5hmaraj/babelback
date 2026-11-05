# Babelback audit brief

Goal: a ranked list of problems and a migration plan we can agree on. This run writes docs only. Do not change source code, commit, or call paid or production services (Apify, Gemini, GCS, Redis). Refer to env vars by name. Never print secret values.

## Decided direction

- Deploy on Railway, with our own Postgres on Railway.
- Inngest runs the workflows (YouTube download -> analysis -> singing feedback).
- The UI gets a rewrite designed from first principles. Do not review current component code. List what the app does: screens, flows, features, edge cases.
- Native mobile apps will use the same backend later.

## Question to answer: what runs the backend?

Compare keeping Next.js route handlers with a standalone API service (Express, and also Hono and Fastify). Recommend one, with reasons. Weigh:

- Mobile clients: token auth instead of cookies, a versioned API, and one typed contract that web and mobile both use (zod, OpenAPI, or RPC types).
- Inngest integration and Railway deployment (one service or two).
- Uploads, streaming media, job progress (polling or SSE), long-running work.
- One developer maintains it.
- Cost of moving the current code.

Also say whether the web frontend should stay on Next.js or become a single-page app once the API is separate.

## Already found (verify, then build on it)

- Half-finished Vite -> Next.js move. App Router serves only `route.ts`, so these files are never served: `app/api/{echo,health,proxy,singing-feedback,song-analysis,upload}.ts`, `app/api/metrics/debug.ts`, `app/api/uploads/audio.ts`. Find out whether singing feedback and the proxy are dead or broken in production.
- Vite leftovers at the root: `App.tsx`, `index.tsx`, `index.css`. `prompts` and `verseParser` exist in both `services/` and `app/api/_lib/`.
- Three YouTube downloaders: `actors/yt-audio-basic` (Apify), `gcp/ytdlp-function`, and `workers/ytdlp-worker`, which has only `.pyc` files committed.
- No server database. Jobs are in Redis. The library and practice attempts are in browser IndexedDB (`db.ts`). Media is in GCS and Vercel Blob.
- Tied to Vercel: `@vercel/blob`, `@vercel/analytics`, `.vercel/`, `scripts/vercel-env-import.sh`.
- Junk committed: `dist/`, `.vercel/`, `__pycache__/`, `backups/`, `log.txt`, about 2.2 MB of PNGs. `@radix-ui/react-slider` and `@vercel/analytics` are pinned to `latest`.
- `docs/TODO.md` has an earlier Postgres plan with a jobs table, a polling worker and HMAC webhooks. Say which parts Inngest replaces.

## Work split

- **Map and backend:** architecture and data flow, every route marked live, dead or duplicate, external services, env vars, and where data is stored. Bugs in the job pipeline: validation, signed URLs, auth, job-state races, error handling, secrets. Vercel coupling.
- **Types, health and product:** run `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` and record the real results. Check whether Gemini responses match `types.ts` and are validated where they enter. List `any` and `@ts-ignore` hot spots, duplicate code, unused dependencies and components, and repo junk. Inventory screens and flows for the UI rewrite.
- **Together at the end:** the backend recommendation, the current -> target map, and the backlog.

## Finding format

One line each: `file:line` | severity (high, med, low) | tag (`fix`, `delete`, or `replaced-by-migration`) | what is wrong and the evidence. Mark anything you could not confirm as `unverified`. Do not suggest fixes for code the migration replaces. Tag it instead.

## Deliverables

- `docs/audit/findings.md`: findings, deduplicated, highest severity first, grouped by area.
- `docs/audit/plan.md`:
  1. Current -> target table: each piece (routes, Redis jobs, polling, downloaders, IndexedDB, Blob/GCS, analytics) mapped to its Railway, Postgres or Inngest replacement, or marked `delete`.
  2. Backend recommendation (above).
  3. Backlog. P0 cleanup: delete dead code and junk, pin dependencies, get tsc and build passing. P1 backend: Railway, Postgres, Inngest, server-owned library, API contract. P2 UI: design from the inventory, then rewrite.
  4. Open decisions, each with a recommendation: YouTube downloads from Railway's datacenter IPs vs. keeping Apify's residential proxy, Inngest Cloud vs. self-hosted, Drizzle vs. Prisma, GCS vs. S3-compatible storage, and auth.
