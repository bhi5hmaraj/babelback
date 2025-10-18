"use client"
import { useRef, useCallback, useEffect, useState } from 'react'
import { useAppInitializer } from '@/hooks/useAppInitializer'
import { useLibraryManager } from '@/hooks/useLibraryManager'
import { useSongDataManager } from '@/hooks/useSongDataManager'
import { useAudioPlaybackManager } from '@/hooks/useAudioPlaybackManager'
import { DEFAULT_MODEL_ID, AVAILABLE_MODELS } from '@/constants'
import type { Language, SeedSongPayload, SongData, LibraryEntry } from '@/types'
import { addSongToLibrary } from '@/db'
import { dbg, dberr } from '@/lib/debug'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'seed-song'

const guessExtension = (mime: string) => {
  if (!mime) return 'm4a'
  const [, subtype] = mime.split('/')
  if (!subtype) return 'm4a'
  if (subtype.includes('mp4')) return 'm4a'
  if (subtype.includes('mpeg')) return 'mp3'
  return subtype
}

export function useSongExplorerController() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [youtubeWorking, setYoutubeWorking] = useState(false)
  const [seedBufferingPercent, setSeedBufferingPercent] = useState<number | null>(null)

  const { apiKeyMissing, initializationError, isInitializing } = useAppInitializer()
  const { refreshLibrary } = useLibraryManager()

  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID)

  const songMgr = useSongDataManager({
    apiKeyMissing,
    selectedModelId,
    refreshLibraryCallback: refreshLibrary,
    practiceExitCallback: () => {},
  })

  const playMgr = useAudioPlaybackManager({ songData: songMgr.songData, audioPlayerRef: audioRef })

  // Reflect actual audio element state
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => setIsPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [songMgr.audioSrc])

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play()
    } else {
      audio.pause()
    }
  }, [])

  const handleSeek = useCallback(
    (time: number) => {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = time
      playMgr.setPlaybackTime(time)
      playMgr.handleTimeUpdate(time)
    },
    [playMgr],
  )

  const handleSelectVerse = useCallback(
    (index: number) => {
      playMgr.seekToVerse(index)
      const v = songMgr.songData?.verses?.[index]
      if (v) handleSeek(v.startTime ?? 0)
    },
    [playMgr, songMgr.songData, handleSeek],
  )

  // YouTube processing via downloadsService
  const handleYoutube = useCallback(async (youtubeUrl: string, format: 'm4a' | 'mp3' = 'm4a') => {
    const { startDownload, getDownloadStatus } = await import('@/services/downloadsService')
    setYoutubeWorking(true)
    try {
      const start = await startDownload(youtubeUrl, format)
      // poll every 4s up to 15 minutes
      const timeoutAt = Date.now() + 15 * 60 * 1000
      let status = await getDownloadStatus(start.jobId)
      while (status.status !== 'completed' && status.status !== 'failed' && Date.now() < timeoutAt) {
        await new Promise((r) => setTimeout(r, 4000))
        status = await getDownloadStatus(start.jobId)
      }
      if (status.status !== 'completed' || !status.url) {
        throw new Error(status.error?.message || 'Failed to process YouTube audio')
      }
      await songMgr.handleUrlAnalyze(status.url, {
        fileName: status.gcsObject?.path?.split('/')?.pop(),
        mimeType: status.gcsObject?.contentType,
        jobId: start.jobId,
      })
    } finally {
      setYoutubeWorking(false)
    }
  }, [songMgr])

  const targetLanguage = songMgr.targetLanguage

  const ingestSeedPayload = useCallback(
    async (seedId: string | null, seed: SeedSongPayload) => {
      const data = seed.songData
      const audioUrl = seed.audioUrl || seed.youtubeUrl
      if (!data || !audioUrl) throw new Error('Seed is missing audio or song data')
      const fallbackTargetLanguage = targetLanguage

      dbg('seed', 'ingest:start', { seedId, title: data.title, hasGcs: !!seed.gcsObject })

      // Step 1: buffer the full audio (same-origin) so seeking works instantly.
      let bufferedBlob: Blob | null = null
      if (seed.gcsObject?.bucket && seed.gcsObject?.path) {
        try {
          const downloadUrl = `/api/media?bucket=${encodeURIComponent(seed.gcsObject.bucket)}&path=${encodeURIComponent(seed.gcsObject.path)}&mode=download`
          dbg('seed', 'buffer:start', downloadUrl)
          const res = await fetch(downloadUrl)
          if (!res.ok) throw new Error(`download ${res.status}`)
          const total = Number(res.headers.get('Content-Length') || '0')
          const ct = res.headers.get('Content-Type') || seed.gcsObject?.contentType || 'audio/mpeg'
          const reader = res.body?.getReader()
          if (reader) {
            const chunks: Uint8Array[] = []
            let received = 0
            setSeedBufferingPercent(0)
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (value) {
                chunks.push(value)
                received += value.length
                if (total) setSeedBufferingPercent(Math.min(99, Math.floor((received / total) * 100)))
              }
            }
            bufferedBlob = new Blob(chunks, { type: ct })
            setSeedBufferingPercent(100)
            dbg('seed', 'buffer:done', { size: bufferedBlob.size, ct, total })
          } else {
            // Fallback: no stream reader, just blob the whole response
            bufferedBlob = await res.blob()
            setSeedBufferingPercent(100)
            dbg('seed', 'buffer:done-nonstream', { size: bufferedBlob.size })
          }
        } catch (err) {
          dberr('seed', 'buffer:error', err)
          setSeedBufferingPercent(null)
        }
      }

      // Step 2: use object URL if we buffered, else fallback to same-origin URL or original URL
      let playbackUrl = audioUrl
      if (bufferedBlob) {
        playbackUrl = URL.createObjectURL(bufferedBlob)
      } else if (seed.gcsObject?.bucket && seed.gcsObject?.path) {
        playbackUrl = `/api/media?bucket=${encodeURIComponent(seed.gcsObject.bucket)}&path=${encodeURIComponent(seed.gcsObject.path)}&mode=download`
      }

      dbg('seed', 'analyze:url', playbackUrl)

      const result = await songMgr.handleUrlAnalyze(playbackUrl, {
        fileName: data.title || 'Seed Song',
        mimeType: (bufferedBlob && bufferedBlob.type) || seed.gcsObject?.contentType || 'audio/mpeg',
        preParsedSongData: data,
        seedTargetLanguage: seed.targetLanguage,
        seedModelId: seed.modelId,
      })

      if (result?.songData) {
        dbg('seed', 'analyze:done', {
          verses: result.songData.verses?.length || 0,
          duration: result.songDuration,
        })
        const audioBlob: Blob | null = bufferedBlob

        const fileType = (audioBlob && audioBlob.type) || seed.gcsObject?.contentType || 'audio/mpeg'
        const safeBase = slugify(result.songData.title || 'Seed Song')
        const fileName = `${safeBase}.${guessExtension(fileType)}`
        const file = audioBlob ? new File([audioBlob], fileName, { type: fileType }) : new File([], fileName, { type: fileType })

        const newId = await addSongToLibrary({
          title: result.songData.title || 'Seed Song',
          originalLanguage: result.songData.originalLanguage,
          targetLanguage: seed.targetLanguage || fallbackTargetLanguage,
          timestamp: Date.now(),
          audioFileBlob: file,
          audioFileName: file.name,
          audioFileType: file.type,
          songData: result.songData,
          processingTimeSeconds: 0,
          songDurationSeconds: result.songDuration || undefined,
          modelIdUsed: seed.modelId || selectedModelId,
        })
        dbg('library', 'added', { id: newId, fileName: file.name, size: file.size })
        await refreshLibrary()
        dbg('library', 'refresh:done')
      }

      return result
    },
    [songMgr, refreshLibrary, selectedModelId, targetLanguage],
  )

  const loadSeed = useCallback(
    async (_cacheKey: string, seed: SeedSongPayload) => ingestSeedPayload(_cacheKey, seed),
    [ingestSeedPayload],
  )

  const loadSeedById = useCallback(
    async (seedId: string) => {
      dbg('seed', 'loadById:fetch', seedId)
      const res = await fetch(`/api/seeds/${encodeURIComponent(seedId)}`)
      if (!res.ok) throw new Error(`Failed to load seed ${seedId}: ${res.status}`)
      const payload = (await res.json()) as SeedSongPayload
      dbg('seed', 'loadById:payload', {
        hasData: !!payload?.songData,
        hasGcs: !!payload?.gcsObject,
        hasAudio: !!payload?.audioUrl,
      })
      return ingestSeedPayload(seedId, payload)
    },
    [ingestSeedPayload],
  )

  const loadLibraryEntry = useCallback(async (entry: LibraryEntry) => {
    // Delegate to song data manager to hydrate audio/song state from a library entry
    songMgr.loadSongFromLibraryEntry(entry, audioRef)
  }, [songMgr])

  return {
    // system/init
    apiKeyMissing,
    initializationError,
    isInitializing,

    // audio element
    audioRef,

    // managers data
    selectedModelId,
    setSelectedModelId,
    audioSrc: songMgr.audioSrc,
    songData: songMgr.songData,
    targetLanguage: songMgr.targetLanguage,
    setTargetLanguage: songMgr.setTargetLanguage,
    isLoading: songMgr.isLoading,
    isPlaying,
    isBusy: songMgr.isLoading || youtubeWorking,
    seedBufferingPercent,
    loadingMessage: songMgr.loadingMessage,
    funLoadingMessage: songMgr.funLoadingMessage,
    analysisProgressPercent: songMgr.analysisProgressPercent,
    error: songMgr.error,

    // playback
    currentVerseIndex: playMgr.currentVerseIndex,
    setCurrentVerseIndex: playMgr.setCurrentVerseIndex,
    playbackTime: playMgr.playbackTime,
    handleTimeUpdate: playMgr.handleTimeUpdate,
    handlePrevVerse: playMgr.handlePrevVerse,
    handleNextVerse: playMgr.handleNextVerse,
    handleSelectVerse,
    handleSeek,
    handleTogglePlay,
    handleYoutube,

    // analysis entry points
    handleAudioSubmit: songMgr.handleAudioSubmit,
    handleUrlAnalyze: songMgr.handleUrlAnalyze,
    handleSongDurationAvailable: songMgr.handleSongDurationAvailable,
    clearCurrentSong: songMgr.clearCurrentSong,
    loadSeed,
    loadSeedById,
    loadLibraryEntry,
  }
}

export type SongExplorerController = ReturnType<typeof useSongExplorerController>
