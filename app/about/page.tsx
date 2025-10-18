import Link from 'next/link'
import '@/styles/mobile-brown-theme.css'
import Icon from '@/components/Icon'

const highlights = [
  {
    icon: 'music',
    title: 'Sync every verse',
    description: 'Lyric scroller keeps the current verse centered while the fixed player stays in view.'
  },
  {
    icon: 'translate',
    title: 'Read in your language',
    description: 'Transliteration, translation, and deeper meaning toggle on in the same pane.'
  },
  {
    icon: 'bookmark',
    title: 'Save it locally',
    description: 'Your browser keeps a private library so songs reopen instantly, even offline.'
  },
  {
    icon: 'microphone-stage',
    title: 'Practice and get feedback',
    description: 'Record yourself, then let AI highlight timing, pronunciation, and clarity verse by verse.'
  }
]

const values = [
  {
    kicker: 'Curiosity first',
    body: 'BabelBack began as a way to make lyrics from other languages feel approachable. Every UI decision leans into warmth, serif typography, and minimal chrome so the story of the song stays in front.'
  },
  {
    kicker: 'Own your library',
    body: 'Analysed songs live in IndexedDB on your device. We sign media per session for security but never keep the audio once you close the tab.'
  },
  {
    kicker: 'Debug-friendly by design',
    body: 'A single debug toggle surfaces buffer progress, signed URLs, and cache hits so future contributors can ship fast without guessing.'
  }
]

export default function AboutPage() {
  return (
    <main className="parchment-shell min-h-screen px-4 pb-16 pt-8 text-[#4a3f35]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="mobile-serif text-3xl font-semibold tracking-tight">
            BabelBack
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#7d6b56]">
            <Link href="/song-explorer/responsive" className="rounded-full border border-[#a67c52] bg-[#a67c52] px-4 py-2 text-white hover:brightness-105">
              Open Explorer
            </Link>
            <Link href="/library" className="rounded-full border border-[#dbd0ba] px-4 py-2 hover:bg-white">
              My Library
            </Link>
            <Link href="/" className="rounded-full border border-[#dbd0ba] px-4 py-2 hover:bg-white">
              Home
            </Link>
          </nav>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-[#dbd0ba]/60 bg-[#fffaf2]/95 px-6 py-10 shadow-[0_24px_60px_rgba(74,63,53,0.12)]">
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              background:
                'radial-gradient(900px 260px at 20% -5%, rgba(214,179,122,0.22), transparent 65%), radial-gradient(940px 320px at 90% 20%, rgba(166,124,82,0.18), transparent 65%)'
            }}
          />
          <div className="relative z-10 space-y-4">
            <h1 className="mobile-serif text-4xl font-semibold leading-tight md:text-5xl">
              Music is a universal story. BabelBack keeps every verse readable, audible, and meaningful.
            </h1>
            <p className="text-sm leading-relaxed text-[#7d6b56] md:text-base max-w-3xl">
              We built BabelBack to feel like a treasured lyric journal: warm serif headings, parchment accents, and AI tools that stay out of the way. Upload a song, translate it, learn the nuances, then save it to return whenever the melody sticks.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {highlights.map((feature) => (
            <div key={feature.title} className="rounded-3xl border border-[#dbd0ba]/60 bg-white/92 px-5 py-6 shadow-[0_16px_40px_rgba(74,63,53,0.1)]">
              <div className="flex items-center gap-3">
                <Icon name={feature.icon} className="text-[#a67c52]" />
                <h2 className="mobile-serif text-xl font-semibold">{feature.title}</h2>
              </div>
              <p className="mt-3 text-sm text-[#7d6b56] leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-[#dbd0ba]/60 bg-white/90 px-6 py-8 shadow-[0_16px_42px_rgba(74,63,53,0.1)] space-y-5">
          <h2 className="mobile-serif text-2xl font-semibold">Our approach</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {values.map((value) => (
              <div key={value.kicker} className="rounded-2xl border border-[#dbd0ba]/50 bg-white/80 p-4 shadow-[0_10px_26px_rgba(74,63,53,0.08)]">
                <p className="text-xs uppercase tracking-[0.28em] text-[#a67c52]">{value.kicker}</p>
                <p className="mt-2 text-sm text-[#7d6b56] leading-relaxed">{value.body}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-[#7d6b56]">
            <Link href="/song-explorer/responsive" className="rounded-xl border border-[#a67c52] bg-[#a67c52] px-5 py-2 text-white hover:brightness-105">
              Try the explorer
            </Link>
            <Link href="/library" className="rounded-xl border border-[#dbd0ba] bg-white/80 px-5 py-2 hover:bg-white">
              View saved songs
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

