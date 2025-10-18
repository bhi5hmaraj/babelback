import React from 'react'
import '@/styles/mobile-brown-theme.css'
import Link from 'next/link'
import { Libre_Baskerville, IBM_Plex_Mono, Lora } from 'next/font/google'
import Icon from '@/components/Icon'
import seedsData from '@/data/seed-songs.json'

const libreBaskerville = Libre_Baskerville({ subsets: ['latin'], weight: ['400', '700'], variable: '--mobile-font-sans' })
const lora = Lora({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--mobile-font-serif' })
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--mobile-font-mono' })

const seedHighlights = seedsData.slice(0, 3)

export default function HomePage() {
  return (
    <main
      className={`mobile-brown-theme min-h-screen px-4 pb-16 pt-8 text-[#4a3f35] ${libreBaskerville.variable} ${lora.variable} ${ibmPlexMono.variable}`}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="mobile-serif text-3xl font-semibold tracking-tight">
            BabelBack
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#7d6b56]">
            <Link href="/song-explorer/responsive" className="rounded-full border border-[#dbd0ba] bg-white/80 px-4 py-2 hover:bg-white">
              Launch Explorer
            </Link>
            <Link href="/library" className="rounded-full border border-[#dbd0ba] px-4 py-2 hover:bg-white">
              My Library
            </Link>
          </nav>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-[#dbd0ba]/60 bg-[#fffaf2]/95 px-6 py-10 shadow-[0_24px_60px_rgba(74,63,53,0.12)]">
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              background:
                'radial-gradient(1100px 360px at 25% -5%, rgba(214,179,122,0.22), transparent 65%), radial-gradient(860px 280px at 85% 20%, rgba(166,124,82,0.18), transparent 65%)',
            }}
          />
          <div className="relative z-10 flex flex-col gap-6">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-[#a67c52]">AI lyric companion</p>
              <h1 className="mobile-serif text-4xl font-semibold leading-tight md:text-5xl">
                Discover lyrics, meanings, and transliterations in one warm space.
              </h1>
              <p className="text-sm leading-relaxed text-[#7d6b56] md:text-base">
                Upload a track or drop a YouTube link, then read synced lyrics with translations, transliterations, and contextual meanings — all styled like a treasured lyric journal.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/song-explorer/responsive"
                className="rounded-xl border border-[#a67c52] bg-[#a67c52] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105"
              >
                Start BabelBack
              </Link>
              <Link
                href="/library"
                className="rounded-xl border border-[#dbd0ba] bg-white/85 px-5 py-2 text-sm font-semibold text-[#7d6b56] hover:bg-white"
              >
                View Saved Songs
              </Link>
            </div>
            <div className="grid gap-3 text-sm text-[#7d6b56] md:grid-cols-2">
              <div className="rounded-2xl border border-[#dbd0ba]/50 bg-white/80 px-4 py-3 shadow-[0_10px_26px_rgba(74,63,53,0.08)]">
                <h3 className="text-xs uppercase tracking-[0.3em] text-[#a67c52]">Core Views</h3>
                <ul className="mt-2 space-y-1">
                  <li className="flex items-start gap-2"><Icon name="music" className="mt-0.5 text-[#a67c52]" /><span>Synced lyric scroller anchored by a fixed player</span></li>
                  <li className="flex items-start gap-2"><Icon name="translate" className="mt-0.5 text-[#a67c52]" /><span>Overlays for transliteration, translation, meaning</span></li>
                </ul>
              </div>
              <div className="rounded-2xl border border-[#dbd0ba]/50 bg-white/80 px-4 py-3 shadow-[0_10px_26px_rgba(74,63,53,0.08)]">
                <h3 className="text-xs uppercase tracking-[0.3em] text-[#a67c52]">Comfort Features</h3>
                <ul className="mt-2 space-y-1">
                  <li className="flex items-start gap-2"><Icon name="bookmark" className="mt-0.5 text-[#a67c52]" /><span>Save analyses locally — no cloud lock-in</span></li>
                  <li className="flex items-start gap-2"><Icon name="sparkle" className="mt-0.5 text-[#a67c52]" /><span>Instant “Try these” seeds to explore the experience</span></li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#dbd0ba]/60 bg-[#fffaf2]/95 px-6 py-8 shadow-[0_18px_48px_rgba(74,63,53,0.1)]">
          <div className="space-y-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="mobile-serif text-2xl font-semibold">Try These</h2>
                <p className="text-sm text-[#7d6b56]">Load a seed to feel the experience instantly. We include the full verse breakdown, translations, and a short meaning.</p>
              </div>
              <Link
                href="/song-explorer/responsive"
                className="self-start rounded-full border border-[#a67c52] bg-[#a67c52] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:brightness-105"
              >
                Launch Explorer
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {seedHighlights.map((seed) => {
                const songTitle = seed.songData?.title || seed.title || 'Seed Song'
                const originLang = seed.songData?.originalLanguage || seed.originalLanguage || 'Original'
                const targetLang = seed.targetLanguage || seed.songData?.targetLanguage || 'Target'
                const meaningSnippet = seed.songData?.verses?.[0]?.meaning || seed.songData?.summary || seed.summary
                return (
                  <div
                    key={seed.id}
                    className="flex h-full flex-col justify-between rounded-3xl border border-[#dbd0ba]/60 bg-white/95 px-8 py-8 shadow-[0_20px_48px_rgba(74,63,53,0.14)]"
                    style={{ minHeight: '360px' }}
                  >
                    <div className="space-y-3">
                      <h3 className="mobile-serif text-2xl font-semibold leading-snug text-[#4a3f35]">
                        {songTitle}
                      </h3>
                      <p className="text-[12px] uppercase tracking-[0.24em] text-[#a67c52]">
                        {originLang} → {targetLang}
                      </p>
                      <p
                        className="text-sm text-[#7d6b56]"
                        style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {meaningSnippet || 'Seed song ready to explore.'}
                      </p>
                      {seed.tags?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {seed.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="parchment-chip text-[11px] uppercase tracking-[0.18em] text-[#7d6b56]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Link
                      href={`/song-explorer/responsive?seed=${encodeURIComponent(seed.id)}`}
                      className="mt-6 inline-flex items-center justify-center rounded-full border border-[#a67c52] bg-[#a67c52] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.3em] text-white hover:brightness-105"
                    >
                      Load In Explorer
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#dbd0ba]/60 bg-white/92 px-6 py-8 shadow-[0_16px_42px_rgba(74,63,53,0.1)]">
          <h2 className="mobile-serif text-2xl font-semibold">Lyric Viewer Preview</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3 text-sm text-[#7d6b56]">
              <p>
                Once inside the explorer, the player stays fixed at the bottom while verses glide through a parchment scroll. We center the active verse, fade neighbors, and bring translations or transliterations in only when you want them.
              </p>
              <p>
                The “Meaning & Context” panel sits above the player, so deeper interpretation is always a thumb reach away—no modal popups, just a calm reading surface.
              </p>
            </div>
            <div className="flex items-center justify-center">
              <div className="w-full max-w-xs rounded-[28px] border border-[#dbd0ba]/70 bg-[#fffaf2] p-4 shadow-[0_18px_40px_rgba(74,63,53,0.16)]">
                <div className="rounded-2xl border border-[#dbd0ba]/50 bg-white/90 p-4">
                  <p className="text-xs uppercase tracking-[0.35em] text-[#a67c52]">Deeper Meaning</p>
                  <h3 className="mobile-serif mt-2 text-lg font-semibold">“Dil se nikle alfaaz…”</h3>
                  <p className="mt-2 text-xs text-[#7d6b56]">
                    Translation: “Words born from the heart.”
                  </p>
                  <p className="mt-2 text-xs italic text-[#7d6b56]">
                    This verse reassures the listener that sincerity survives every distance—our layout keeps meaning, transliteration, and original lines breathing in one view.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-[#dbd0ba]/60 bg-white/90 px-5 py-6 shadow-[0_14px_40px_rgba(74,63,53,0.08)]">
            <h2 className="mobile-serif text-xl font-semibold">How BabelBack Works</h2>
            <ol className="mt-3 space-y-3 text-sm text-[#7d6b56]">
              <li className="flex gap-3">
                <span className="mt-0.5 h-6 w-6 rounded-full bg-[#a67c52] text-center text-xs font-bold leading-6 text-white">1</span>
                <span>Upload audio or paste a YouTube link. We handle downloads and caching.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 h-6 w-6 rounded-full bg-[#a67c52] text-center text-xs font-bold leading-6 text-white">2</span>
                <span>Gemini parses lyrics, translation, transliteration, and meanings per verse.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 h-6 w-6 rounded-full bg-[#a67c52] text-center text-xs font-bold leading-6 text-white">3</span>
                <span>Explore in the lyric viewer, then save the song to revisit instantly.</span>
              </li>
            </ol>
          </div>
          <div className="rounded-3xl border border-[#dbd0ba]/60 bg-white/90 px-5 py-6 shadow-[0_14px_40px_rgba(74,63,53,0.08)]">
            <h2 className="mobile-serif text-xl font-semibold">Why the Parchment Look?</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#7d6b56]">
              Lyrics feel like poetry, so we keep the interface warm, tactile, and distraction-free. The fixed player stays tucked at the bottom, while verse cards float above subtle fades. You can take this vibe to both mobile and desktop without losing clarity.
            </p>
          </div>
        </section>

        <footer className="border-t border-[#dbd0ba]/60 pt-6 text-xs text-[#7d6b56]">
          <p>BabelBack • Crafted for lyric lovers. All analysis runs with your credentials; saved songs stay on your device.</p>
        </footer>
      </div>
    </main>
  )
}
