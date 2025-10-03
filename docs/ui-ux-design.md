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

