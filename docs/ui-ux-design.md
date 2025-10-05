# UI/UX Design — Mobile‑First Lyrics + Responsive Workspace

This document defines a practical, responsive design for Babelback that prioritizes lyrics on mobile (Focus layout) while offering a richer split view on desktop (Workspace layout). It consolidates interaction patterns, layout rules, accessibility, and a phased rollout plan.

## Goals
- Make lyrics the hero on phones (70–85% height, large type).
- Show one thing at a time on small screens; reduce on‑screen choices.
- Keep desktop powerful with a split view for lyrics + context tools.
- Maintain one codebase, one design system.

## Layout Strategy
- Single responsive design with two layouts:
  - Focus (Mobile‑first): fullscreen, Spotify‑style lyrics view.
  - Workspace (Desktop): split view — lyrics left, panels right.
- Auto‑select by breakpoint; manual toggle available.

### Breakpoints & Defaults
- ≤ 640px (mobile): Focus by default.
- 641–1023px (tablet): Focus by default, Workspace available.
- ≥ 1024px (desktop): Workspace by default, Focus available.

## Focus Layout (Mobile‑first)
- Header: back/close, song title (truncated), overflow menu (⋯).
- Content: large, centered lyrics list; current line emphasized, adjacent lines dimmed; soft top/bottom fades.
- Footer: player controls pinned (play/pause, previous/next, progress).
- Mode control: compact segmented control for Original / Transliteration / Translation (only one visible). Optional dual‑line mode via ⋯.
- Meaning: toggle tab (Synced / Meaning) shares the same layout/scale as lyrics.
- Karaoke highlight: inline per‑phrase sweep (underline/color), no “chips”; avoid nested scrolls.
- Interactions: swipe up from mini player to open; swipe down to close; tap to show/hide chrome; tap line to seek; long‑press word for tooltip (optional).
- Scrolling: keep active line around 50% of viewport; smooth 250–350ms; single scroll region sized to `calc(100vh - header - footer)` with safe‑area padding.

## Workspace Layout (Desktop)
- Grid split: 60–70% width left = lyrics; 30–40% right = panels (Meaning, Summary, Verse List, Practice).
- Right panels as tabs/accordions; optional resizable handle.
- Persistent toolbar (top): Source, Model, Language, Mode, Library.
- Player docked bottom; lyrics still use “center on mid‑screen”.

## Typography & Readability
- Current line: 22–28px (mobile), 28–34px (desktop), semi/bold, 92–100% opacity.
- Adjacent lines: 18–20px (mobile), 22–24px (desktop), 60–75% opacity; older: 40–50%.
- Line height: 1.5–1.7; aim for 5–8 visible lines on 360×800 devices.
- Limit line length ~32–40 characters where possible.

## Controls & IA
- Mobile: collapse non‑essential controls (Source/Model/Language) into a ⋯ sheet; expose Mode toggle in lyrics header.
- Desktop: keep controls in a compact top toolbar; panels on right for deeper info/actions.
- Practice: subflow launched from lyrics (select verse → record → feedback), returns to lyrics.

## Accessibility
- Targets ≥ 44×44 px touch area.
- High contrast for active line; avoid relying only on color for karaoke highlight.
- Respect reduced motion preference (disable highlight sweep, use instant state changes).
- Support screen readers: set `aria-live="polite"` on the active line container; label toggles clearly.

## Performance
- Single scroll container (no nested scrollbars).
- Virtualize lyrics (render ±5–10 lines around the active line).
- Debounce auto‑scroll to once per phrase/line; prefer `requestAnimationFrame`.
- Avoid heavy shadows and large image re‑paints; use GPU‑friendly transforms.

## Quick Wins (Phase 0)
- Mobile layout in `VerseDisplay`: replace “chips” with inline text; big type; increased line height; remove inner scrolls.
- Ensure lyrics container height ~65–75vh; sticky player controls with safe‑area padding.
- Move Meaning into a toggle inside lyrics on small screens.

## Phased Rollout
1) Phase 0 — Quick fixes (UI only)
   - Mobile “line layout”; larger type; remove chips; single scroll area.
2) Phase 1 — Fullscreen Lyrics component
   - `components/LyricsFullscreen.tsx`; `isLyricsOpen` state; segmented control (Original/Transliteration/Translation) + Synced/Meaning toggle; header/footer chrome; gestures.
3) Phase 2 — Desktop Workspace split view
   - Grid with right panel tabs; resize handle (optional); toolbar consolidation.
4) Phase 3 — Polish & Perf
   - Karaoke inline highlight sweep; text size selector; virtualization; light haptics.

## Component Changes
- `VerseDisplay.tsx`
  - Mobile: inline lyric lines, no chips; expose `onLineTap(index)`; active line styling.
  - Center‑on‑mid scroll utility; avoid nested scrolls.
- `LyricsFullscreen.tsx` (new)
  - Focus layout container, segmented controls, header/footer chrome, safe‑area handling.
- `RightPanel.tsx` (new)
  - Tabs/accordions for Meaning, Summary, Practice, Verse List.
- `PlayerControls.tsx`
  - Condensed mobile footer; safe‑area padding; sticky docking.
- `App.tsx`
  - `isLyricsOpen` state, Focus/Workspace toggle; move Meaning toggle into lyrics on mobile.

## Tailwind/CSS Cheatsheet
- Container heights: `h-[calc(100vh-160px)] md:h-auto` (adjust header/footer offsets).
- Active line: `text-2xl md:text-3xl font-semibold` (mobile/desktop); adjacent: `text-lg opacity-70`.
- Footer: `fixed bottom-0 inset-x-0 pb-[env(safe-area-inset-bottom)] bg-gradient-to-t from-slate-900/80`.
- Desktop grid: `lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6`.

## Acceptance Criteria
- Mobile 360×800: ≥ 5 visible lines; current line ≥ 22px; no nested scrollbars; meaning toggle in ≤ 1 tap; controls reachable; smooth mid‑screen scroll.
- Desktop ≥ 1280px: split view with lyrics + one panel; resizing doesn’t overlap; smooth scroll behavior retained.

## Open Questions
- Dual‑line mode default (Original+Translation) — off by default on mobile?
- Per‑word translation tooltip — gated behind long‑press only?
- Text size slider — global setting or per‑song?

---

Inspired by fullscreen lyrics patterns (e.g., Spotify‑style) while tailored to Babelback’s translation/transliteration needs.

## Fixed‑Screen App (No Page Scroll) — Tabs + Sticky Player

This variant locks the app to a single viewport with tabbed navigation and a bottom player that’s always visible.

**Structure**
- Root grid (100dvh/100svh): header, tabs, content, player.
- No page scroll: html, body { height: 100%; overflow: hidden; }.
- Safe areas: padding with env(safe-area-inset-*) and viewport‑fit=cover.

**Grid Rows**
- Header: auto.
- Tabs bar: 44–56px.
- Content pane: 1fr (fills remaining space).
- Player bar: 64–80px (+ safe‑area bottom).

**Tabs (single focus per pane)**
- Setup: Source (YouTube/File), Model, Language, Mode, primary action (Babelback).
- Lyrics: centered active line, dimmed neighbors, karaoke inline highlight, Synced/Meaning toggle.
- Meaning: paged sections (Verse meaning, Summary, Analysis) with left/right arrows.
- Practice: verse selector (carousel/arrows), Record/Stop, feedback.
- Library: paginated list (Prev/Next), no infinite scroll.

**Sticky Player (bottom)**
- Play/pause, prev/next, scrubber/time; optional output device in ⋯.
- Always visible; large tap targets; safe‑area padding.

**Behavior & Layout Rules**
- Tabs switch content without page scroll; content panes manage their own internal paging.
- Lyrics pane: overflow hidden; auto‑scrolls active line into view; optional swipe gestures.
- Setup/Meaning/Practice/Library: stepped or paged sections (no vertical scrolling).

**Breakpoints**
- Mobile ≤ 640px: Focused typography (active line ~22–24px), minimal chrome.
- Desktop ≥ 1024px: Same fixed grid; optional Workspace toggle to show a narrow side panel next to Lyrics.

**Implementation Plan**
- App shell: grid container in App.tsx (100dvh); new TabsBar and PlayerBar components.
- Panes: SetupPane, LyricsPane, MeaningPane, PracticePane, LibraryPane.
- Styles: grid‑rows‑[auto_48px_minmax(0,1fr)_72px] on small; adjust for desktop; overflow‑hidden on content pane.
- Inputs: use bottom sheets on mobile (avoid keyboard pushing layout).

**Acceptance Criteria (Fixed‑Screen)**
- 360×800: no page scroll; player always visible; tab switch instant; Lyrics auto‑scroll; other panes fit within content pane height.
- Desktop: resizing preserves layout; no page scroll; player sticky.

**Risks & Mitigations**
- iOS Safari dynamic bars: prefer 100dvh with 100svh fallback; add safe-area padding to player.
- On-screen keyboard: open inputs in sheets; keep player visible.
- Reduced motion: disable karaoke sweep when prefers-reduced-motion.

## Future Architecture & Routing Roadmap

To support richer async flows (upload → download → analysis → practice) and upcoming features such as user accounts, social sharing, and cloud libraries, the UI will move from a single-page shell to a routed Next.js application backed by a modular “core” layer.

### Shared Model Layer
- Extract hooks, services, types, and constants into `core/` (or a workspace package) so multiple front-ends can share the same business logic.
- API routes (`/api/*`) become thin controllers that call into the shared services (controllers → services → vendor SDKs).
- Add unit tests for hooks/services before migrating the UI.

### Next.js Migration Phases
1. **Phase 0 – Prep**: audit hooks/services; ensure browser-only APIs are isolated; set up a Next.js workspace alongside the current Vite app.
2. **Phase 1 – Core Extraction**: move `useSongDataManager`, `useSingingPractice`, `geminiService`, etc. into `core`; update Vite imports to validate the abstraction.
3. **Phase 2 – Bootstrap Next**: configure Next (App Router), TypeScript, Tailwind/theme; add path aliases so Next can import from `core`.
4. **Phase 3 – Routes**: implement `/setup`, `/lyrics`, `/meaning`, `/practice`, `/library` (plus `/about`, `/tech`, `/changelog`); reuse the sticky header/tabs/player in an `app/(main)/layout.tsx`.
5. **Phase 4 – Context Provider**: wrap routes in `<SongProvider>` (client component) that instantiates the shared hooks once and exposes state/actions to every route.
6. **Phase 5 – Async Flow Integration**: after each task, push to the next route (`router.push('/lyrics')`, etc.); show per-route loaders while uploads/downloads/analysis run.
7. **Phase 6 – API Alignment**: either keep existing Vercel serverless functions (via rewrites) or move their logic into Next’s `/app/api/*`, still consuming the same services.
8. **Phase 7 – Decommission Vite**: once parity is achieved, retire or archive the old SPA; optionally keep both apps if desktop/mobile shells diverge.

### Backend Evolution (Auth, Social, Library)
- Introduce a dedicated backend service (Fastify/Express or Next API routes backed by a database) that handles:
  - User authentication (OAuth/passwordless) and session management.
  - Persistent libraries (songs, practice history, progress) stored in Postgres or Firestore.
  - Social features (leaderboards, shared playlists) via REST/GraphQL endpoints.
- Keep the existing client-side IndexedDB as an offline cache that syncs with the server when logged in.
- Add analytics/telemetry emitters in the core services so both front-ends report consistent metrics regardless of hosting stack.
- Plan deployment: separate infra for the backend (e.g., Fly.io/Render/Serverless DB) or leverage Next’s server functions with edge caching where appropriate.

This roadmap lets us adopt true routing (better async hand-offs) while laying the foundation for user accounts and collaborative features without rewriting the business logic a second time.
