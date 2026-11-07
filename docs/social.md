# Social features

Status: proposal, 2026-11-07. It replaces the one-line "Social features (leaderboards, shared playlists)" in `ui-ux-design.md:181` and the v1 non-goal "Public sharing/embedding flows" in `DESIGN.md:397`. No other branch has a social doc.

## Why now

Each YouTube video is downloaded once and analysed once per language. Everyone who adds it reads the same rows (`apps/api/src/schema.ts:36-68`, `youtube.ts:144-145`, `analysis.ts:34`). A song one person imported costs us nothing to serve to the next person.

The home page shows only the three seed songs (`apps/web/app/page.tsx:12`), so nobody finds the songs others already imported. When someone does add one, they pay the full 8 credits for work we skip (`youtube.ts:104-120`).

## How it works today

| Data | Who can read it | Code |
|---|---|---|
| YouTube audio and its analyses | Anyone with a library entry for it | `audio.ts:204-212` |
| Seed songs | Everyone, signed in or out | `seeds.ts:11` |
| Uploaded audio | The owner | `schema.ts:38`, `audio.ts:207` |
| Practice recordings and scores | The person who sang | `practice.ts` |
| Who listens to what | Not recorded. `library_entries.last_opened_at` keeps its insert default and nothing updates it | `schema.ts:107` |

## Rules

1. Uploads and practice recordings never appear in a public list.
2. Activity stays anonymous until a person opts in.
3. A list shows a song only when at least 3 different people have it, so a list never reveals one person's taste.
4. A song costs credits only when we do work for it: a download or a Gemini call.
5. The admin can hide any song from every list.

## Decisions

### 1. What can people see about each other?

| Option | What others see | Cost | Risk |
|---|---|---|---|
| **A. Anonymous counts (phase 1)** | "Popular this week", "14 people learning this" | One index, one column | Low, with the 3-person floor |
| B. Opt-in profiles (phase 2) | A handle, a public library, best practice scores | `users.handle`, `users.public` | Medium: handles need moderation |
| C. Public by default | Every listen, friends' activity | Follows table, feed | High: people joined a private tool |

Build A first and add B once A works. C stays out.

### 2. Can you open a popular song without adding it?

| Option | Behavior | Tradeoff |
|---|---|---|
| **A. Any signed-in user can open a YouTube song (recommended)** | `accessibleAsset` also allows `source = 'youtube'` for signed-in users. Opening creates a free library entry when an analysis exists in their language | We stream YouTube-derived audio to anyone with an account |
| B. Add before opening | The card leads to the add flow, which is free under rule 4 | One extra step |
| C. Signed-out visitors can open it too | A public player | The largest copyright exposure, and no reason left to sign up |

### 3. What counts as popular?

| Option | Signal | Cost |
|---|---|---|
| **A. Distinct people who opened the song in the last 7 days (recommended)** | Set `library_entries.last_opened_at = now()` when `GET /v1/analyses/:id` (`audio.ts:158`) succeeds | One update and one index |
| B. Distinct people who added it in the last 7 days | `library_entries.created_at` | Works today. Counts one-time adds the same as repeat listening |
| C. A listen events table | One row per play | Only needed for "listening right now" or charts by the hour |

## Phase 1: popular songs on the home page

```
What are we listening to?
[ Add your own song + ]

Popular this week          All  Hindi  Tamil  Kannada
  Belageddu   Kannada to English   14 learning   >
  Saheba      Hindi to English      9 learning   >

Try these, free
  (seed cards, as today)
```

Signed-out visitors see the same titles and counts. Tapping one goes to sign-in.

**API**
- New `GET /v1/catalog/popular?language=English` returns up to 20 songs, each with:
  - asset id, title and artist;
  - original language;
  - the analysis id in the requested language, when one exists;
  - the number of distinct people who opened it in the last 7 days.
- It lists only songs with `source = 'youtube'`, not hidden and with a count of at least 3.
- Everyone gets the same list, so the api caches it for 5 minutes.
- `GET /v1/analyses/:id` sets `last_opened_at`. For a YouTube song the reader has not added yet, it creates the free library entry (decision 2A).

**Pricing**
- `youtube.ts:104-106` and `audio.ts:124-127` look for a cached analysis only inside the requester's own library.
- They should look across all users: same asset, language, model and prompt version.
- A paid job then runs only when a download or a Gemini call will happen.

**Schema** (one migration)
- An index on `library_entries (asset_id, last_opened_at)`.
- `audio_assets.hidden_at timestamptz`, with a toggle on the admin page. A hidden song leaves every list and opens only for people who already have it.

**UI**
- Song cards and the player header show "N people learning this", from the same count.
- Below 3 people, they show nothing.

## Phase 2: opt-in profiles, practice boards, share links

- **Profiles:** `users.handle` (unique, 3 to 20 characters, the admin can reset it) and `users.public boolean default false`.
- **Practice board per song:** the best overall score per person per verse in the last 30 days, from `practice_attempts`.
  - People with a public profile show their handle. Everyone else counts toward the total under no name.
  - Gemini scores are easy to game, so the board shows a top 10 with no prizes.
- **Share link:** a server-rendered page at `/s/<analysisId>`.
  - It shows the title, the languages, the learner count and the first two lines.
  - Full lyrics and audio still need sign-in.

## Phase 3: follows

- A `follows (follower_id, followee_id)` table. You can follow only public profiles.
- The home page gains "From people you follow": the songs they opened this week.
- Build it only if phase 2 shows that people set handles.

## Not planned

- Comments and chat: the moderation cost is high and the payoff unclear.
- Likes: adding a song to your library already saves it.
- Notifications.

## Risks

| Risk | Mitigation |
|---|---|
| Copyright: a catalog of YouTube-derived audio with full lyric translations | Playback and full lyrics need sign-in. `hidden_at` is the takedown path. Get legal advice before the public share page in phase 2 |
| Privacy: small counts identify people | The 3-person floor. Uploads never listed. No names before opt-in |
| Offensive YouTube titles on the home page | The floor keeps one person's import off the home page. The admin can hide any song |
| Cold start: too few people reach the floor | The Popular section hides itself when empty, and the seeds stay |

## Open questions

1. Should re-using an existing analysis stay free, or cost 1 credit so credits keep their value?
2. Should the floor rise above 3 as traffic grows?
3. Should signed-out visitors see popular titles at all?

## Metrics

- The share of YouTube imports served from the cache.
- Taps on Popular cards, and how many lead to a library entry.
- Week-two retention for people who opened a Popular song, compared with people who did not.
