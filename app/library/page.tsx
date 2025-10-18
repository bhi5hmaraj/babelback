"use client"
import '@/styles/mobile-brown-theme.css'
import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLibraryManager } from '@/hooks/useLibraryManager'
import { deleteSongFromLibrary } from '@/db'
import type { LibraryEntry } from '@/types'

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

export default function LibraryPage() {
  const { libraryEntries, isLoadingLibrary, refreshLibrary } = useLibraryManager()
  const router = useRouter()

  const handleOpen = async (entry: LibraryEntry) => {
    router.push(`/song-explorer/responsive?libraryId=${entry.id}`)
  }

  const handleDelete = async (id: number) => {
    await deleteSongFromLibrary(id)
    await refreshLibrary()
  }

  return (
    <main className="parchment-shell min-h-screen px-4 pb-16 pt-6 text-[#4a3f35]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="mobile-serif text-3xl font-semibold tracking-tight">
            BabelBack
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#7d6b56]">
            <Link href="/song-explorer/responsive" className="rounded-full border border-[#a67c52] bg-[#a67c52] px-4 py-2 text-white hover:brightness-105">
              Open Explorer
            </Link>
            <Link href="/" className="rounded-full border border-[#dbd0ba] px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/about" className="rounded-full border border-[#dbd0ba] px-4 py-2 hover:bg-white">
              About
            </Link>
          </nav>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-[#dbd0ba]/60 bg-[#fffaf2]/95 px-6 py-8 shadow-[0_24px_60px_rgba(74,63,53,0.12)]">
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              background:
                'radial-gradient(1000px 280px at 25% -5%, rgba(214,179,122,0.22), transparent 65%), radial-gradient(900px 320px at 85% 30%, rgba(166,124,82,0.18), transparent 65%)',
            }}
          />
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-3">
              <h1 className="mobile-serif text-3xl font-semibold">My Song Library</h1>
              <p className="text-sm text-[#7d6b56] md:text-base">
                Every analyzed song lives here on your device. Reopen a seed, revisit a translation, or delete what you no longer need—no cloud syncing, just your personal parchment shelf.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm font-semibold text-[#7d6b56]">
              <Link href="/song-explorer/responsive" className="rounded-xl border border-[#a67c52] bg-[#a67c52] px-5 py-2 text-white hover:brightness-105">
                Start New Analysis
              </Link>
              <Link href="/" className="rounded-xl border border-[#dbd0ba] bg-white/85 px-5 py-2 hover:bg-white">
                Back Home
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#dbd0ba]/60 bg-[#fffaf2]/92 px-6 py-8 shadow-[0_18px_48px_rgba(74,63,53,0.1)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="mobile-serif text-xl font-semibold">Recently Saved Songs</h2>
              <p className="text-sm text-[#7d6b56]">Select a song to reopen the full lyric explorer.</p>
            </div>
            <Link
              href="/song-explorer/responsive"
              className="self-start rounded-full border border-[#dbd0ba] bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7d6b56] hover:bg-white"
            >
              New Analysis
            </Link>
          </div>

          {isLoadingLibrary && libraryEntries.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[#dbd0ba]/70 bg-white/70 p-6 text-center text-sm text-[#7d6b56]">
              Loading your saved songs…
            </div>
          ) : libraryEntries.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[#dbd0ba]/70 bg-white/70 p-6 text-sm text-[#7d6b56]">
              No songs saved yet. Go to <Link className="underline" href="/song-explorer/responsive">Song Explorer</Link> and analyze a file or YouTube link.
            </div>
          ) : (
            <ul className="mt-6 space-y-4">
              {libraryEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-3 rounded-2xl border border-[#dbd0ba]/60 bg-white/90 px-5 py-4 shadow-[0_12px_30px_rgba(74,63,53,0.1)] md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="mobile-serif truncate text-lg font-semibold text-[#4a3f35]">{entry.title}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#a67c52]">
                      {entry.originalLanguage} → {String(entry.targetLanguage)}
                    </p>
                    <p className="text-xs text-[#7d6b56]">Added {formatDate(entry.timestamp)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleOpen(entry)}
                      className="rounded-full border border-[#a67c52] bg-[#a67c52] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:brightness-105"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="rounded-full border border-[#dbd0ba] bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d6b56] hover:bg-white"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
