# Mobile redesign

The mockups in this folder are the target for `apps/web`. Each `.dc.html` file is one phone screen (390x844). Read them as source: the markup and inline styles give the layout, and the `THEMES` table in each script gives the tokens. The live canvas is https://claude.ai/artifact/V2XbwoF7KDPGUJ8btS6BTS (private to the owner).

## Themes

- Implement the `THEMES` table as CSS variables in `apps/web/app/globals.css`, one block per `[data-theme="night"|"day"|"retro"]`, plus `--accent`.
- `themeFor()` in the mockups shows the derived values: `ink` is the accent used as text (darker on Day), `tint` is the accent at 14% alpha.
- Retro uses VT323 for chrome and the "sounds like" line. Hindi and Tamil always render in Noto Sans Devanagari and Noto Sans Tamil.
- The Appearance screen saves the theme and accent in a cookie for now. The root layout reads the cookie and sets `data-theme` and `--accent` on `<html>`, so the first paint is right. A later change moves them to the `users` table.

## Scope of this run

These screens work against the current API (`GET /v1/seeds`, `GET /v1/seeds/:id`):

| Screen | Mockup | Route |
|---|---|---|
| Home | `Main.dc.html` | `/` |
| Player | `Player.dc.html` | `/songs/[id]` |
| Line detail | `Verse.dc.html` | `/songs/[id]/lines/[n]` |
| Appearance | `Appearance.dc.html` | `/settings/appearance` |

- Home: the wordmark, the heading, the "Try these, free" seeds from the API, and a link to Appearance. Leave out the paste box, the processing card, the credits chip and the bottom nav. They need auth, uploads and jobs, which do not exist yet.
- Player: the Script, Sounds like and Meaning chips; the current line highlighted and scrolled into view; the seek bar split by line from the verse times; previous and next line; loop line; play and pause; the retro LCD header when the theme is retro.
- Line detail: the line, sounds like, translation and meaning. Leave out the Words chips. The analysis data has no word glosses yet.
- Out of scope: Add, Processing, Library, Practise, Sign in.

## Rules

- Next.js App Router, pages only, no route handlers. Server components fetch through `hc<AppType>` from `apps/web/api.ts`. Client components only where the page needs state: the player and the appearance picker.
- No new dependencies.
- Real `<button>` and `<a href>`, `aria-pressed` on toggles, 44px touch targets, text contrast of at least 4.5:1 in every theme.
- ASCII in code, except lyrics and other real non-English text.

## Checks

- `npm run build -w web` and `npm run typecheck -w api` from `apps/`.
- Run the web app against the deployed API: `API_URL=https://api-production-bf7e.up.railway.app npm run dev -w web` from `apps/`.
