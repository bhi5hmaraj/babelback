"use client"
import * as React from 'react'
import Link from 'next/link'
import { ViewTabs, type ViewTier } from './components/ViewTabs'
import { PlayerFooter } from './components/PlayerFooter'
import { BasicView } from './views/BasicView'
import { AdvancedView, type AdvancedOptions } from './views/AdvancedView'
import { SnapshotView } from './views/SnapshotView'
import { VerseSheet } from './views/VerseSheet'
import type { Verse } from '@/types'
import { useSongExplorerController } from './controller/useSongExplorerController'
import SetupView from './setup/SetupView'
import { cn } from '@/lib/utils'
import { useSearchParams } from 'next/navigation'
import { getSongFromLibrary } from '@/db'
import fallbackSeedsData from '@/data/seed-songs.json'
import LoadingSpinner from '@/components/LoadingSpinner'
import { dbg } from '@/lib/debug'

import '@/styles/mobile-brown-theme.css'

export default function SongExplorerScreen() {
  const ctrl = useSongExplorerController()
  const search = useSearchParams()
  const searchStr = search?.toString() ?? ''
  const seedKey = React.useMemo(() => {
    if (!searchStr) return null
    const q = new URLSearchParams(searchStr)
    return q.get('seed')
  }, [searchStr])
  const libraryId = React.useMemo(() => {
    if (!searchStr) return null
    const q = new URLSearchParams(searchStr)
    const v = q.get('libraryId')
    return v && /^\d+$/.test(v) ? Number(v) : null
  }, [searchStr])
  const [view, setView] = React.useState<ViewTier>('basic')
  const [options, setOptions] = React.useState<AdvancedOptions>({ transliteration: true, translation: true, meaning: true })
  const [openSheet, setOpenSheet] = React.useState(false)
  const [showDetails, setShowDetails] = React.useState(false)
  const loadedSeedRef = React.useRef<string | null>(null)
  const [pendingSeedId, setPendingSeedId] = React.useState<string | null>(null)

  const verses = ctrl.songData?.verses ?? []
  const activeVerse: Verse | null = verses[ctrl.currentVerseIndex] ?? null
  const duration = React.useMemo(() => {
    if (!verses.length) return 0
    const last = verses[verses.length - 1]
    return last?.endTime ?? 0
  }, [verses])

  // Deep-link: /song-explorer/responsive?libraryId=123
  React.useEffect(() => {
    if (libraryId == null || ctrl.songData) return
    void (async () => {
      try {
        dbg('screen', 'loadFromLibrary', libraryId)
        const entry = await getSongFromLibrary(libraryId)
        dbg('screen', 'loadFromLibrary:entry', !!entry)
        if (entry) ctrl.loadLibraryEntry(entry)
      } catch (e) {
        console.error('[SongExplorer] Failed to open library entry', e)
      }
    })()
  }, [libraryId, ctrl.songData, ctrl.loadLibraryEntry])

  React.useEffect(() => {
    if (!seedKey) {
      setPendingSeedId(null)
      return
    }
    if (ctrl.songData && loadedSeedRef.current === seedKey) {
      setPendingSeedId(null)
      return
    }
    if (loadedSeedRef.current === seedKey) return
    loadedSeedRef.current = seedKey // guard against rerenders causing loops
    let cancelled = false
    setPendingSeedId(seedKey)

    const fallback = fallbackSeedsData.find((seed) => seed.id === seedKey)
    dbg('screen', 'seed:detected', { seedKey, hasFallback: !!fallback })
    const seedPromise = fallback
      ? ctrl.loadSeed(seedKey, fallback)
      : ctrl.loadSeedById(seedKey)

    seedPromise
      .then(() => {
        if (!cancelled) {
          dbg('screen', 'seed:loaded', seedKey)
          setPendingSeedId(null)
        }
      })
      .catch((err) => {
        console.error('[SongExplorer] Failed to load seed from query', err)
        if (!cancelled) setPendingSeedId(null)
      })
    return () => {
      cancelled = true
    }
  }, [seedKey, ctrl.songData, ctrl.loadSeedById, ctrl.loadSeed])

  return (
    <div className={cn('parchment-shell flex h-screen flex-col text-[#4a3f35]')}>
      <audio
        ref={ctrl.audioRef}
        src={ctrl.audioSrc ?? undefined}
        preload="auto"
        className="hidden"
        onTimeUpdate={(e) => ctrl.handleTimeUpdate((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => {
          const d = (e.target as HTMLAudioElement).duration
          if (Number.isFinite(d)) ctrl.handleSongDurationAvailable(d)
        }}
      />
      <header className="safe-top z-20 flex items-center justify-between gap-2 px-3 py-2 bg-[#fffcf5]/85 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#7d6b56]">
          <Link href="/" className="rounded-full border border-[#dbd0ba] px-3 py-1 hover:bg-white">Home</Link>
          <Link href="/library" className="rounded-full border border-[#dbd0ba] px-3 py-1 hover:bg-white">Library</Link>
        </div>
        <div className="mx-2 flex-1 text-center">
          <h1 className="mobile-serif text-sm font-semibold leading-snug">
            {ctrl.songData?.title || 'Song Explorer'}
          </h1>
          <p className="text-[9px] text-[#7d6b56]">Target: {ctrl.targetLanguage}</p>
        </div>
        <div className="text-[10px] font-semibold text-[#7d6b56]">Index {verses.length ? ctrl.currentVerseIndex + 1 : 0}/{verses.length}</div>
      </header>

      {ctrl.songData && (
        <div className="flex items-center justify-center gap-2 px-3 py-1">
          <ViewTabs active={view} onChange={setView} />
        </div>
      )}

      {!ctrl.songData && (
        <main className="relative flex-1 overflow-hidden px-3 pt-3">
          {pendingSeedId ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-full max-w-sm rounded-3xl border border-[#dbd0ba]/70 bg-[#fffaf2]/95 p-6 text-center shadow-[0_18px_46px_rgba(74,63,53,0.12)]">
                <p className="text-xs uppercase tracking-[0.3em] text-[#a67c52]">Loading</p>
                <h2 className="mobile-serif mt-2 text-lg font-semibold text-[#4a3f35]">Preparing seed experience…</h2>
                <LoadingSpinner
                  message="Fetching lyrics, translation, and audio"
                  progressPercent={typeof ctrl.seedBufferingPercent === 'number' ? ctrl.seedBufferingPercent : undefined as any}
                />
                <p className="text-[11px] text-[#7d6b56]">This takes a few seconds the first time while we sign a private audio link.</p>
              </div>
            </div>
          ) : (
            <SetupView
              isBusy={!!ctrl.isBusy}
              apiKeyMissing={!!ctrl.apiKeyMissing}
              error={ctrl.initializationError || ctrl.error}
              onProcessFile={ctrl.handleAudioSubmit}
              onProcessYoutube={(url) => ctrl.handleYoutube(url)}
              onLoadSeed={ctrl.loadSeed}
              targetLanguage={ctrl.targetLanguage}
              onLanguageSelect={ctrl.setTargetLanguage as any}
              selectedModelId={ctrl.selectedModelId}
              onModelSelect={ctrl.setSelectedModelId}
              loadingMessage={ctrl.loadingMessage}
              funLoadingMessage={ctrl.funLoadingMessage}
            />
          )}
        </main>
      )}

      {view === 'advanced' && (
        <div className="flex flex-wrap items-center justify-center gap-2 px-4">
          {([
            { key: 'transliteration', label: 'Translit' },
            { key: 'translation', label: 'Translate' },
            { key: 'meaning', label: 'Meaning' },
          ] as { key: keyof AdvancedOptions; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
              className={cn(
                'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
                options[key] ? 'border-[#a67c52] bg-[#a67c52] text-white' : 'border-[#dbd0ba] bg-white/70 text-[#7d6b56]'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {ctrl.songData && (
      <main className="relative flex-1 overflow-hidden px-3 pt-3">
        <div className="relative h-full rounded-2xl border border-[#dbd0ba]/30 bg-[#fffaf2]/90 px-4 py-3 flex flex-col">
          <div className="top-fade" />
          <div className="bottom-fade" />

          <div className="relative z-10 flex h-full flex-col items-stretch pb-28">
            {view === 'basic' && (
              <>
                <div className="flex-1 overflow-y-auto pr-1 rounded-2xl border border-[#dbd0ba]/50 bg-white/40 scroll-parchment">
                  <BasicView
                    verses={verses}
                    currentIndex={ctrl.currentVerseIndex}
                    onSelectVerse={ctrl.handleSelectVerse}
                    className="mt-1"
                  />
                </div>
                {activeVerse && (
                  <section className="mt-2 mb-3 rounded-2xl border border-[#dbd0ba] bg-white/80 p-3 overflow-y-auto h-[clamp(180px,36vh,300px)] scroll-parchment">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a67c52] mb-2">
                      Meaning & Context
                    </h3>
                    <p className="text-[15px] leading-relaxed verse-meaning">
                      {activeVerse.meaning?.trim() || activeVerse.translation?.trim() || 'Meaning not available yet.'}
                    </p>
                  </section>
                )}
              </>
            )}

            {view === 'advanced' && (
              <div className="flex-1 overflow-y-auto pr-1 rounded-2xl border border-[#dbd0ba]/50 bg-white/40 scroll-parchment">
                <AdvancedView
                verses={verses}
                currentIndex={ctrl.currentVerseIndex}
                options={options}
                onSelectVerse={ctrl.handleSelectVerse}
                className="mt-1"
                />
              </div>
            )}

            {view === 'snapshot' && (
              <div className="mt-1">
                <SnapshotView title="Song Snapshot" summary={ctrl.songData?.summary || ''} />
              </div>
            )}

            {/* No pill in Basic; details are embedded above the player */}
          </div>
        </div>
      </main>
      )}

      {ctrl.songData && (
        <PlayerFooter
          className="fixed inset-x-0 bottom-0 z-30 bg-[#f5f1e6]/95 pb-[8px] pt-3 shadow-[0_-6px_20px_rgba(74,63,53,0.12)]"
          currentTime={ctrl.playbackTime}
          duration={duration}
          isPlaying={!!ctrl.isPlaying}
          onPrev={ctrl.handlePrevVerse}
          onNext={ctrl.handleNextVerse}
          onTogglePlay={ctrl.handleTogglePlay}
          onSeek={ctrl.handleSeek}
        />
      )}

      {/* details row removed */}

      {ctrl.songData && (
        <VerseSheet verse={activeVerse} open={openSheet} onOpenChange={setOpenSheet} />
      )}
    </div>
  )
}
