"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  MoreVertical,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkle,
} from "lucide-react"
import { Libre_Baskerville, IBM_Plex_Mono, Lora } from "next/font/google"

import {
  AVAILABLE_MODELS,
  DEFAULT_MODEL_ID,
  SUPPORTED_LANGUAGES,
  AI_THOUGHTS_AND_JOKES,
} from "@/constants"
import { useAppInitializer } from "@/hooks/useAppInitializer"
import { useLibraryManager } from "@/hooks/useLibraryManager"
import { useSongDataManager } from "@/hooks/useSongDataManager"
import { useAudioPlaybackManager } from "@/hooks/useAudioPlaybackManager"
import type { Language, LibraryEntry, SeedSongPayload, Verse } from "@/types"
import { cn } from "@/lib/utils"

import { addSongToLibrary } from "@/db"
import { trackEvent } from "@/services/analytics"
import { startDownload, getDownloadStatus } from "@/services/downloadsService"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import SeedLibraryView from "@/components/SeedLibraryView"

import "@/styles/mobile-brown-theme.css"

const libreBaskerville = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--mobile-font-sans" })
const lora = Lora({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--mobile-font-serif" })
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--mobile-font-mono" })

type AdvancedOptionKey = "transliteration" | "translation" | "meaning"

const FALLBACK_SUMMARY =
  "Upload a track to translate, transliterate, and practice with AI guidance. This mobile-first workspace keeps lyrics focused and clutter-free."

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "--:--"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

const getMeaningText = (verse: Verse) => verse.meaning?.trim() || verse.translation?.trim() || "Meaning not available yet."

const MobileSongExplorerPrototype = () => {
  const router = useRouter()

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null)
  const activeLineRef = useRef<HTMLDivElement | null>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID)
  const [sourceMode, setSourceMode] = useState<'file' | 'youtube'>('file')
  const [viewTier, setViewTier] = useState<'basic' | 'advanced' | 'snapshot'>("basic")
  const [advancedOptions, setAdvancedOptions] = useState<Record<AdvancedOptionKey, boolean>>({
    transliteration: true,
    translation: true,
    meaning: true,
  })
  const [showVerseSheet, setShowVerseSheet] = useState(false)
  const [showChrome, setShowChrome] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [showFullSnapshot, setShowFullSnapshot] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [youtubeFormat, setYoutubeFormat] = useState<"m4a" | "mp3">("m4a")
  const [isYoutubeWorking, setIsYoutubeWorking] = useState(false)
  const [youtubeStatusMessage, setYoutubeStatusMessage] = useState<string | null>(null)

  const { apiKeyMissing, initializationError, isInitializing } = useAppInitializer()
  const { refreshLibrary } = useLibraryManager()

  const {
    audioSrc,
    songData,
    targetLanguage,
    setTargetLanguage,
    isLoading,
    loadingMessage,
    funLoadingMessage,
    analysisProgressPercent,
    error,
    handleAudioSubmit: smHandleAudioSubmit,
    handleUrlAnalyze: smHandleUrlAnalyze,
    handleSongDurationAvailable,
    clearCurrentSong,
  } = useSongDataManager({
    apiKeyMissing,
    selectedModelId,
    refreshLibraryCallback: refreshLibrary,
    practiceExitCallback: () => {},
  })

  const {
    currentVerseIndex,
    playbackTime,
    setCurrentVerseIndex,
    setPlaybackTime,
    handleTimeUpdate,
    seekToVerse,
    handleNextVerse,
    handlePrevVerse,
  } = useAudioPlaybackManager({ songData, audioPlayerRef })

  const verses = songData?.verses ?? []

  const fallbackDuration = useMemo(() => {
    if (!verses.length) return 0
    const last = verses[verses.length - 1]
    return last.endTime && Number.isFinite(last.endTime) ? last.endTime : 0
  }, [verses])

  useEffect(() => {
    if (!songData) {
      setViewTier('basic')
      setAdvancedOptions({ transliteration: true, translation: true, meaning: true })
      setShowChrome(true)
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      return
    }

    setCurrentVerseIndex(0)
    setPlaybackTime(0)
    setCurrentTime(0)
    if (fallbackDuration) {
      setDuration(fallbackDuration)
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = 0
      audioPlayerRef.current.pause()
    }
  }, [songData, fallbackDuration, setCurrentVerseIndex, setPlaybackTime])

  useEffect(() => {
    const audio = audioPlayerRef.current
    if (!audio) return

    const handleTime = () => {
      const time = audio.currentTime
      setCurrentTime(time)
      handleTimeUpdate(time)
    }

    const handleLoadedMetadata = () => {
      const audioDuration = Number.isFinite(audio.duration) ? audio.duration : fallbackDuration
      if (audioDuration) {
        setDuration(audioDuration)
        handleSongDurationAvailable(audioDuration)
      }
    }

    const handlePlayEvent = () => setIsPlaying(true)
    const handlePauseEvent = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(Number.isFinite(audio.duration) ? audio.duration : fallbackDuration)
    }

    audio.addEventListener("timeupdate", handleTime)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("play", handlePlayEvent)
    audio.addEventListener("pause", handlePauseEvent)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("timeupdate", handleTime)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("play", handlePlayEvent)
      audio.removeEventListener("pause", handlePauseEvent)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [handleTimeUpdate, handleSongDurationAvailable, fallbackDuration])

  useEffect(() => {
    if (!audioSrc) return
    const audio = audioPlayerRef.current
    if (!audio) return
    audio.load()
    audio.pause()
    setIsPlaying(false)
    setCurrentTime(0)
  }, [audioSrc])

  useEffect(() => {
    if (!lyricsContainerRef.current || !activeLineRef.current) return
    // Center the active verse smoothly within the scroll area (Advanced mode)
    try {
      activeLineRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch {}
  }, [currentVerseIndex])

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    setSelectedFile(nextFile)
    setProcessingError(null)
    if (nextFile) setSourceMode('file')
  }, [])

  const toggleAdvancedOption = useCallback((key: AdvancedOptionKey) => {
    setAdvancedOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (!next.transliteration && !next.translation && !next.meaning) {
        return prev
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (viewTier === 'basic') {
      setShowVerseSheet(false)
    }
  }, [viewTier])

  const handleProcessLocalFile = useCallback(async () => {
    if (!selectedFile || isLoading) return
    if (apiKeyMissing) {
      setProcessingError("Cannot process audio: API key missing.")
      return
    }
    setSourceMode('file')
    setProcessingError(null)
    setYoutubeStatusMessage(null)

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause()
      audioPlayerRef.current.currentTime = 0
    }

    setCurrentVerseIndex(0)
    setPlaybackTime(0)

    try {
      const result = await smHandleAudioSubmit(selectedFile)
      if (result && result.songData && result.modelIdUsed) {
        const newEntry: Omit<LibraryEntry, "id"> = {
          title: result.songData.title || selectedFile.name,
          originalLanguage: result.songData.originalLanguage,
          targetLanguage,
          timestamp: Date.now(),
          audioFileBlob: selectedFile,
          audioFileName: selectedFile.name,
          audioFileType: selectedFile.type,
          songData: result.songData,
          processingTimeSeconds: result.processingTimeSeconds,
          songDurationSeconds: result.songDuration || undefined,
          modelIdUsed: result.modelIdUsed,
        }
        try {
          await addSongToLibrary(newEntry)
          await refreshLibrary()
          trackEvent("library_song_saved", { origin: "mobile-file" })
        } catch (dbErr) {
          console.error("[MobileSongExplorer] Failed to save song to library", dbErr)
          setProcessingError("Processed song but failed to save in local library.")
        }
      }
    } catch (err: any) {
      console.error("[MobileSongExplorer] Error processing file", err)
      setProcessingError(err?.message || "Failed to process audio file.")
    }
  }, [
    apiKeyMissing,
    selectedFile,
    isLoading,
    targetLanguage,
    smHandleAudioSubmit,
    refreshLibrary,
    setCurrentVerseIndex,
    setPlaybackTime,
  ])

  const handleProcessYoutube = useCallback(async () => {
    if (!youtubeUrl || isLoading || isYoutubeWorking) return
    if (!/^https?:\/\//i.test(youtubeUrl)) {
      setProcessingError("Please paste a valid YouTube URL.")
      setYoutubeStatusMessage(null)
      return
    }
    if (apiKeyMissing) {
      setProcessingError("Cannot process YouTube audio: API key missing.")
      setYoutubeStatusMessage(null)
      return
    }

    setSourceMode('youtube')
    setProcessingError(null)
    setYoutubeStatusMessage("Fetching audio from YouTube…")
    setIsYoutubeWorking(true)

    let intervalId: number | null = null
    try {
      const start = await startDownload(youtubeUrl, youtubeFormat)
      const jokes = AI_THOUGHTS_AND_JOKES
      let idx = 0
      intervalId = window.setInterval(() => {
        setYoutubeStatusMessage(jokes[idx++ % jokes.length])
      }, 2500)

      let status = await getDownloadStatus(start.jobId)
      const timeoutAt = Date.now() + 15 * 60 * 1000
      while (status.status !== "completed" && status.status !== "failed" && Date.now() < timeoutAt) {
        await new Promise((resolve) => setTimeout(resolve, 4000))
        status = await getDownloadStatus(start.jobId)
      }

      if (status.status === 'failed') {
        setProcessingError(status.error?.message || 'Failed to process YouTube audio.')
        return
      }

      if (status.status !== "completed" || !status.url) {
        setProcessingError("Failed to process YouTube audio.")
        return
      }

      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current.currentTime = 0
      }

      setCurrentVerseIndex(0)
      setPlaybackTime(0)

      const result = await smHandleUrlAnalyze(status.url, {
        fileName: status.gcsObject?.path?.split("/")?.pop(),
        mimeType: status.gcsObject?.contentType,
        jobId: start.jobId,
      })

      if (result && result.songData && result.modelIdUsed) {
        // synthesise a tiny file placeholder for library persistence
        const dummyFile = new File([], result.songData.title || "YouTube audio", {
          type: status.gcsObject?.contentType || "audio/mpeg",
        })
        const newEntry: Omit<LibraryEntry, "id"> = {
          title: result.songData.title || "YouTube audio",
          originalLanguage: result.songData.originalLanguage,
          targetLanguage,
          timestamp: Date.now(),
          audioFileBlob: dummyFile,
          audioFileName: dummyFile.name,
          audioFileType: dummyFile.type,
          songData: result.songData,
          processingTimeSeconds: result.processingTimeSeconds,
          songDurationSeconds: result.songDuration || undefined,
          modelIdUsed: result.modelIdUsed,
        }
        try {
          await addSongToLibrary(newEntry)
          await refreshLibrary()
          trackEvent("library_song_saved", { origin: "mobile-youtube" })
        } catch (dbErr) {
          console.error("[MobileSongExplorer] Failed to save YouTube audio to library", dbErr)
          setProcessingError("Processed YouTube audio but failed to save in local library.")
        }
      }
    } catch (err: any) {
      console.error("[MobileSongExplorer] Error processing YouTube audio", err)
      setProcessingError(err?.message || "Failed to fetch YouTube audio.")
    } finally {
      if (intervalId) window.clearInterval(intervalId)
      setIsYoutubeWorking(false)
      setYoutubeStatusMessage(null)
    }
  }, [
    youtubeUrl,
    youtubeFormat,
    isLoading,
    isYoutubeWorking,
    apiKeyMissing,
    targetLanguage,
    smHandleAudioSubmit,
    refreshLibrary,
    setCurrentVerseIndex,
    setPlaybackTime,
  ])

  const handleBabelBack = useCallback(async () => {
    setProcessingError(null)
    if (sourceMode === 'file') {
      if (!selectedFile) {
        setProcessingError('Please choose an audio file before continuing.')
        return
      }
      await handleProcessLocalFile()
    } else {
      if (!youtubeUrl) {
        setProcessingError('Please paste a YouTube URL before continuing.')
        return
      }
      await handleProcessYoutube()
    }
  }, [sourceMode, selectedFile, youtubeUrl, handleProcessLocalFile, handleProcessYoutube])

  const handleLanguageSelect = useCallback(
    (value: string) => {
      setTargetLanguage(value as Language)
    },
    [setTargetLanguage],
  )

  const handleTogglePlay = useCallback(() => {
    const audio = audioPlayerRef.current
    if (!audio) return
    if (audio.paused) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }, [])

  const handleSeek = useCallback(
    (time: number) => {
      const audio = audioPlayerRef.current
      if (!audio) return
      audio.currentTime = time
      setCurrentTime(time)
      handleTimeUpdate(time)
      if (audio.paused && time >= duration) {
        setIsPlaying(false)
      }
    },
    [duration, handleTimeUpdate],
  )

  const handleSelectVerse = useCallback(
    (index: number) => {
      if (!verses[index]) return
      seekToVerse(index)
      const start = verses[index].startTime ?? 0
      handleSeek(start)
    },
    [seekToVerse, handleSeek, verses],
  )

  const handleReturnToSetup = useCallback(() => {
    clearCurrentSong(audioPlayerRef)
    setSelectedFile(null)
    setViewTier('basic')
    setAdvancedOptions({ transliteration: true, translation: true, meaning: true })
    setShowChrome(true)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setProcessingError(null)
    setYoutubeUrl("")
    setYoutubeStatusMessage(null)
    setIsYoutubeWorking(false)
    setSourceMode('file')
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [clearCurrentSong])

  const handleLoadSeed = useCallback(async (cacheKey: string, seedData: SeedSongPayload) => {
    try {
      setProcessingError(null)
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current.currentTime = 0
      }

      setCurrentVerseIndex(0)
      setPlaybackTime(0)

      // seedData contains: songData, audioUrl, targetLanguage, modelId, etc.
      const { songData, targetLanguage: seedLang, modelId } = seedData
      const resolvedAudioUrl = seedData.audioUrl || seedData.youtubeUrl

      if (!songData || !resolvedAudioUrl) {
        throw new Error('Seed is missing audio or song analysis data')
      }

      // Load the seed's analyzed song data directly without re-analyzing
      const result = await smHandleUrlAnalyze(resolvedAudioUrl, {
        fileName: songData.title || "Seed Song",
        mimeType: seedData.gcsObject?.contentType || "audio/mpeg",
        preParsedSongData: songData, // Pass the pre-analyzed song data
        seedTargetLanguage: seedLang,
        seedModelId: modelId,
      })

      if (result && result.songData) {
        // Create a placeholder file for library storage
        const dummyFile = new File([], result.songData.title || "Seed Song", {
          type: "audio/mpeg",
        })

        const newEntry: Omit<LibraryEntry, "id"> = {
          title: result.songData.title || "Seed Song",
          originalLanguage: result.songData.originalLanguage,
          targetLanguage: seedLang || targetLanguage,
          timestamp: Date.now(),
          audioFileBlob: dummyFile,
          audioFileName: dummyFile.name,
          audioFileType: dummyFile.type,
          songData: result.songData,
          processingTimeSeconds: 0, // Instant since it's pre-analyzed
          songDurationSeconds: result.songDuration || undefined,
          modelIdUsed: modelId || result.modelIdUsed,
        }

        try {
          await addSongToLibrary(newEntry)
          await refreshLibrary()
          trackEvent("seed_song_loaded", { title: songData.title, origin: "mobile" })
        } catch (dbErr) {
          console.error("[MobileSongExplorer] Failed to save seed to library", dbErr)
          setProcessingError("Loaded seed but failed to save in local library.")
        }
      }

      console.log('[MobileSongExplorer] Loaded seed song:', songData.title)
    } catch (err: any) {
      console.error('[MobileSongExplorer] Error loading seed:', err)
      setProcessingError(err?.message || "Failed to load seed song")
    }
  }, [
    targetLanguage,
    smHandleUrlAnalyze,
    refreshLibrary,
    setCurrentVerseIndex,
    setPlaybackTime,
  ])

  const showSetupView = !songData
  const combinedError = processingError || initializationError || error
  const summary = songData?.summary?.trim() || FALLBACK_SUMMARY
  const isActionBusy = isLoading || isYoutubeWorking

  const fontClasses = cn(
    "mobile-brown-theme",
    libreBaskerville.variable,
    lora.variable,
    ibmPlexMono.variable,
  )

  if (showSetupView) {
    return (
      <div className={cn(fontClasses, "min-h-screen pb-24 text-[#4a3f35]")}>        
        <div className="safe-top" />
        <div className="mx-auto mt-12 w-full max-w-xl rounded-[32px] border border-[#dbd0ba] bg-[#fffcf5]/90 p-8 shadow-[0_20px_45px_rgba(74,63,53,0.15)] backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-medium text-[#7d6b56]">
            <Sparkle className="h-4 w-4" />
            Mobile Preview Flow
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">Start a New Session</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#7d6b56]">
            Upload your track or drop in a YouTube link, then let BabelBack translate, transliterate, and analyse it.
          </p>

          <div className="mt-10 space-y-6">
            <div className="flex items-center justify-center gap-3 rounded-full border border-[#dbd0ba] bg-[#fffaf2] p-1">
              <button
                type="button"
                onClick={() => {
                  setSourceMode('file')
                  setProcessingError(null)
                }}
                className={cn(
                  'flex-1 rounded-full px-4 py-2 text-sm font-medium transition',
                  sourceMode === 'file'
                    ? 'bg-[#a67c52] text-white shadow-lg'
                    : 'text-[#7d6b56] hover:text-[#4a3f35]'
                )}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceMode('youtube')
                  setProcessingError(null)
                }}
                className={cn(
                  'flex-1 rounded-full px-4 py-2 text-sm font-medium transition',
                  sourceMode === 'youtube'
                    ? 'bg-[#a67c52] text-white shadow-lg'
                    : 'text-[#7d6b56] hover:text-[#4a3f35]'
                )}
              >
                YouTube Link
              </button>
            </div>

            <div className="space-y-6">
              <div
                className={cn(
                  "space-y-3 rounded-2xl border border-transparent p-1 transition-opacity",
                  sourceMode !== 'file' && "pointer-events-none opacity-50",
                )}
              >
                <label className="text-sm font-medium text-[#4a3f35]">Audio File</label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  disabled={isActionBusy}
                  className="cursor-pointer rounded-xl border border-[#dbd0ba] bg-[#f5f1e6] text-[#4a3f35] file:mr-4 file:rounded-lg file:border-0 file:bg-[#d4c8aa] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#4a3f35] hover:file:bg-[#c0a080]/80"
                />
                <p className="text-xs text-[#7d6b56]">
                  {selectedFile ? `Selected: ${selectedFile.name}` : "Supports MP3, WAV, AAC, M4A and more."}
                </p>
              </div>

              <div
                className={cn(
                  "space-y-3 rounded-2xl border border-transparent p-1 transition-opacity",
                  sourceMode !== 'youtube' && "pointer-events-none opacity-50",
                )}
              >
                <label className="text-sm font-medium text-[#4a3f35]">YouTube Link</label>
                <Input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(event) => {
                    const next = event.target.value
                    setYoutubeUrl(next)
                    if (next) setSourceMode('youtube')
                    setProcessingError(null)
                  }}
                  disabled={isActionBusy}
                  className="rounded-xl border border-[#dbd0ba] bg-[#f5f1e6] text-[#4a3f35]"
                />
                <div className="flex items-center justify-between text-xs text-[#7d6b56]">
                  <span>Select format:</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={youtubeFormat === "m4a" ? "default" : "ghost"}
                      size="sm"
                      className={cn(
                        "rounded-full px-4 text-xs",
                        youtubeFormat === "m4a"
                          ? "bg-[#a67c52] text-white hover:bg-[#8d6e4c]"
                          : "border border-[#dbd0ba] bg-[#fffaf2] text-[#4a3f35] hover:bg-[#ece5d8]/80",
                      )}
                      onClick={() => setYoutubeFormat("m4a")}
                      disabled={isActionBusy || sourceMode !== 'youtube'}
                    >
                      M4A
                    </Button>
                    <Button
                      type="button"
                      variant={youtubeFormat === "mp3" ? "default" : "ghost"}
                      size="sm"
                      className={cn(
                        "rounded-full px-4 text-xs",
                        youtubeFormat === "mp3"
                          ? "bg-[#a67c52] text-white hover:bg-[#8d6e4c]"
                          : "border border-[#dbd0ba] bg-[#fffaf2] text-[#4a3f35] hover:bg-[#ece5d8]/80",
                      )}
                      onClick={() => setYoutubeFormat("mp3")}
                      disabled={isActionBusy || sourceMode !== 'youtube'}
                    >
                      MP3
                    </Button>
                  </div>
                </div>
                {youtubeStatusMessage && (
                  <p className="text-xs text-[#7d6b56]">{youtubeStatusMessage}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#4a3f35]">Target Language</label>
                <Select value={targetLanguage} onValueChange={handleLanguageSelect} disabled={isActionBusy}>
                  <SelectTrigger className="rounded-xl border border-[#dbd0ba] bg-[#f5f1e6] text-[#4a3f35]">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent className="border border-[#dbd0ba] bg-[#fffaf2] text-[#4a3f35]">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#4a3f35]">Gemini Model</label>
                <Select value={selectedModelId} onValueChange={setSelectedModelId} disabled={isActionBusy}>
                  <SelectTrigger className="rounded-xl border border-[#dbd0ba] bg-[#f5f1e6] text-[#4a3f35]">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent className="border border-[#dbd0ba] bg-[#fffaf2] text-[#4a3f35]">
                    {AVAILABLE_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading && (
              <div className="rounded-2xl border border-[#d4c8aa] bg-white/70 p-4 text-sm text-[#4a3f35] shadow-inner">
                {analysisProgressPercent !== null && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-[#7d6b56]">
                      <span>Analysis Progress</span>
                      <span>{analysisProgressPercent}%</span>
                    </div>
                    <Progress value={analysisProgressPercent ?? 0} />
                  </div>
                )}
                <p className="mt-2 text-sm text-[#4a3f35]">{loadingMessage || "Preparing analysis…"}</p>
                {funLoadingMessage && <p className="text-xs text-[#7d6b56]">{funLoadingMessage}</p>}
              </div>
            )}

            {combinedError && (
              <div className="rounded-2xl border border-[#b54a35]/40 bg-[#b54a35]/10 p-4 text-sm text-[#6f2b1d]">
                {initializationError && <p>{initializationError}</p>}
                {error && (!initializationError || error !== initializationError) && <p>{error}</p>}
                {processingError && (!error || processingError !== error) && <p>{processingError}</p>}
              </div>
            )}

            {apiKeyMissing && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-200/40 p-3 text-xs text-[#573d10]">
                API key missing. Add credentials to analyse songs.
              </div>
            )}

            {isInitializing && (
              <div className="flex items-center gap-2 rounded-2xl border border-[#d4c8aa] bg-white/70 p-3 text-xs text-[#7d6b56]">
                <Spinner className="size-4" /> Preparing local library…
              </div>
            )}

            <Button
              className="w-full rounded-full bg-[#a67c52] py-4 text-base font-semibold text-white shadow-lg shadow-[#a67c52]/40 transition hover:bg-[#8d6e4c]"
              disabled={apiKeyMissing || isActionBusy}
              onClick={handleBabelBack}
            >
              {isActionBusy ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner className="size-5 text-white" />
                  {isYoutubeWorking ? youtubeStatusMessage || 'Processing YouTube audio…' : 'Processing song…'}
                </span>
              ) : (
                'BabelBack!'
              )}
            </Button>

            <div className="rounded-2xl border border-[#dbd0ba] bg-white/70 p-4 text-sm text-[#4a3f35] shadow-inner">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-[#4a3f35]">
                    <Sparkle className="h-4 w-4 text-[#a67c52]" /> Try these
                  </h2>
                  <p className="text-xs text-[#7d6b56]">Start with a curated song to see the full flow instantly.</p>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto pr-1">
                <SeedLibraryView onLoadSeed={handleLoadSeed} title={null} description={null} />
              </div>
            </div>

            <Button
              asChild
              variant="ghost"
              className="w-full rounded-full border border-[#dbd0ba] bg-white/60 text-sm font-medium text-[#4a3f35] hover:bg-white"
            >
              <Link href="/song-explorer">Back to current desktop UI</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!songData) {
    return null
  }

  const activeVerse = verses[currentVerseIndex] ?? null

  return (
    <div className={cn(fontClasses, "flex h-screen flex-col text-[#4a3f35]")}>
      <audio ref={audioPlayerRef} src={audioSrc ?? undefined} preload="auto" className="hidden" />

      <header
        className={cn(
          "safe-top z-20 flex items-center justify-between px-4 py-3 bg-[#fffcf5]/80 backdrop-blur-lg shadow-sm transition-transform duration-300",
          !showChrome && "-translate-y-full",
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="rounded-full text-[#4a3f35] hover:bg-[#d4c8aa]/60"
          aria-label="Go back"
        >
          <ChevronDown className="h-6 w-6" />
        </Button>

        <div className="mx-4 flex-1 text-center">
          <h1 className="text-lg font-semibold truncate text-balance">{songData.title || selectedFile?.name || "Untitled"}</h1>
          <p className="text-xs text-[#7d6b56]">Target: {targetLanguage}</p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-[#4a3f35] hover:bg-[#d4c8aa]/60"
          aria-label="Options"
        >
          <MoreVertical className="h-6 w-6" />
        </Button>
      </header>

      <div
        className={cn(
          "flex flex-col items-center gap-3 px-4 py-4 transition-transform duration-300",
          !showChrome && "-translate-y-full",
        )}
      >
        <div className="inline-flex rounded-full border border-[#c0a080]/60 bg-[#f5efe0]/80 p-1 shadow-inner">
          {["basic", "advanced", "snapshot"].map((tier) => (
            <button
              key={tier}
              onClick={() => setViewTier(tier as 'basic' | 'advanced' | 'snapshot')}
              className={cn(
                "px-5 py-2 text-sm font-semibold capitalize rounded-full transition",
                viewTier === tier
                  ? "bg-[#a67c52] text-white shadow-lg"
                  : "text-[#7d6b56] hover:text-[#4a3f35]",
              )}
            >
              {tier}
            </button>
          ))}
        </div>

        {viewTier === 'advanced' && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {([
              { key: 'transliteration', label: 'Transliteration' },
              { key: 'translation', label: 'Translation' },
              { key: 'meaning', label: 'Meaning' },
            ] as { key: AdvancedOptionKey; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleAdvancedOption(key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] transition",
                  advancedOptions[key]
                    ? "border-[#a67c52] bg-[#a67c52] text-white shadow-sm"
                    : "border-[#dbd0ba] bg-white/70 text-[#7d6b56] hover:bg-[#f5efe0]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="relative flex-1 px-3 pt-4 overflow-hidden">
        <div
          ref={lyricsContainerRef}
          className="relative h-full overflow-y-auto rounded-2xl border border-[#dbd0ba]/30 bg-[#fffaf2]/90 px-4 py-5"
          onClick={() => setShowChrome((value) => !value)}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#fffaf2] via-[#fffaf2]/90 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#fffaf2] via-[#fffaf2]/90 to-transparent" />

          {viewTier === 'basic' ? (
            <div className="relative z-10 flex h-full flex-col items-stretch pb-44">
              <div className="mb-3 flex items-center justify-center gap-3">
                <Button variant="ghost" size="icon" className="rounded-full text-[#4a3f35] hover:bg-[#d4c8aa]/60" onClick={() => handlePrevVerse()} aria-label="Previous verse">
                  <SkipBack className="h-5 w-5" />
                </Button>
                <div className="text-xs text-[#7d6b56]">Verse {currentVerseIndex + 1} of {verses.length}</div>
                <Button variant="ghost" size="icon" className="rounded-full text-[#4a3f35] hover:bg-[#d4c8aa]/60" onClick={() => handleNextVerse()} aria-label="Next verse">
                  <SkipForward className="h-5 w-5" />
                </Button>
              </div>

              {(() => {
                const win = 2
                const start = Math.max(0, currentVerseIndex - win)
                const end = Math.min(verses.length - 1, currentVerseIndex + win)
                const slice = verses.slice(start, end + 1)
                return (
                  <div className="flex flex-1 flex-col items-stretch gap-3">
                    {slice.map((verse, i) => {
                      const absoluteIndex = start + i
                      const isActive = absoluteIndex === currentVerseIndex
                      return (
                        <div
                          key={verse.verseNumber ?? absoluteIndex}
                          data-verse-index={absoluteIndex}
                          data-active-verse={isActive ? 'true' : undefined}
                          ref={isActive ? activeLineRef : null}
                          onClick={(e) => { e.stopPropagation(); handleSelectVerse(absoluteIndex) }}
                          className={cn('cursor-pointer rounded-2xl border px-4 py-4 text-center transition-all duration-300', isActive ? 'border-[#c0a080] bg-white shadow-lg' : 'border-transparent bg-white/70 hover:border-[#dbd0ba] opacity-90')}
                        >
                          <p className={cn('leading-relaxed', isActive ? 'text-lg font-semibold text-[#2d2621]' : 'text-base text-[#4a3f35]')}>{verse.original || '…'}</p>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          ) : viewTier === 'advanced' ? (
            <div className="relative z-10 flex h-full flex-col items-stretch pb-44">
              <div className="mb-3 flex items-center justify-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-[#4a3f35] hover:bg-[#d4c8aa]/60"
                  onClick={() => handlePrevVerse()}
                  aria-label="Previous verse"
                >
                  <SkipBack className="h-5 w-5" />
                </Button>
                <div className="text-xs text-[#7d6b56]">Verse {currentVerseIndex + 1} of {verses.length}</div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-[#4a3f35] hover:bg-[#d4c8aa]/60"
                  onClick={() => handleNextVerse()}
                  aria-label="Next verse"
                >
                  <SkipForward className="h-5 w-5" />
                </Button>
              </div>

              {(() => {
                const win = 2
                const start = Math.max(0, currentVerseIndex - win)
                const end = Math.min(verses.length - 1, currentVerseIndex + win)
                const slice = verses.slice(start, end + 1)
                return (
                  <div className="flex flex-1 flex-col items-stretch gap-3">
                    {slice.map((verse, i) => {
                      const absoluteIndex = start + i
                      const isActive = absoluteIndex === currentVerseIndex
                      return (
                        <div
                          key={verse.verseNumber ?? absoluteIndex}
                          data-verse-index={absoluteIndex}
                          data-active-verse={isActive ? 'true' : undefined}
                          ref={isActive ? activeLineRef : null}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleSelectVerse(absoluteIndex)
                            if (isActive && advancedOptions.meaning) setShowVerseSheet(true)
                          }}
                          className={cn(
                            'cursor-pointer rounded-2xl border px-4 py-4 transition-all duration-300',
                            isActive
                              ? 'border-[#c0a080] bg-white shadow-lg'
                              : 'border-transparent bg-white/70 hover:border-[#dbd0ba] opacity-80',
                          )}
                        >
                          <p className={cn('text-center leading-relaxed', isActive ? 'text-lg font-semibold text-[#2d2621]' : 'text-base text-[#4a3f35]')}>{verse.original || '…'}</p>
                          {advancedOptions.transliteration && verse.transliteration && (
                            <p className={cn('mt-2 text-center text-sm text-[#7d6b56]', !isActive && 'opacity-85')}>{verse.transliteration}</p>
                          )}
                          {advancedOptions.translation && verse.translation && (
                            <p className={cn('mt-2 text-center text-sm text-[#4a3f35]', !isActive && 'opacity-90')}>{verse.translation}</p>
                          )}
                          {advancedOptions.meaning && isActive && (
                            <>
                              <div className="my-3 h-px bg-gradient-to-r from-transparent via-[#dbd0ba] to-transparent" />
                              <p className="text-sm leading-relaxed text-[#5c4d3f]">{getMeaningText(verse)}</p>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}
        </div>

        {viewTier === 'advanced' && (
          <Sheet open={showVerseSheet} onOpenChange={setShowVerseSheet}>
            <SheetContent side="bottom" className="max-h-[90vh] rounded-t-3xl border-t-2 border-[#dbd0ba] bg-[#fffcf5]">
              {activeVerse ? (
                <>
                  <SheetHeader>
                    <SheetTitle className="text-lg font-semibold text-[#4a3f35]">
                      Verse {activeVerse.verseNumber ?? currentVerseIndex + 1} of {verses.length}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-[#7d6b56]">
                      {formatTime(activeVerse.startTime ?? 0)} - {formatTime(activeVerse.endTime ?? 0)}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 space-y-4 overflow-y-auto pb-4">
                    <section className="rounded-2xl border border-[#dbd0ba] bg-white/80 p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a67c52] mb-2">
                        Original {songData.originalLanguage && `(${songData.originalLanguage})`}
                      </h3>
                      <p className="text-base leading-relaxed text-[#2d2621]">{activeVerse.original || 'Original lyric unavailable'}</p>
                    </section>

                    {advancedOptions.transliteration && activeVerse.transliteration && (
                      <section className="rounded-2xl border border-[#dbd0ba] bg-white/80 p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a67c52] mb-2">
                          Transliteration
                        </h3>
                        <p className="text-sm leading-relaxed text-[#4a3f35]">{activeVerse.transliteration}</p>
                      </section>
                    )}

                    {advancedOptions.translation && activeVerse.translation && (
                      <section className="rounded-2xl border border-[#dbd0ba] bg-white/80 p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a67c52] mb-2">
                          Translation ({targetLanguage})
                        </h3>
                        <p className="text-sm leading-relaxed text-[#4a3f35]">{activeVerse.translation}</p>
                      </section>
                    )}

                    {advancedOptions.meaning && (
                      <section className="rounded-2xl border border-[#dbd0ba] bg-white/80 p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a67c52] mb-2">
                          Meaning & Context
                        </h3>
                        <p className="text-sm leading-relaxed text-[#5c4d3f]">{getMeaningText(activeVerse)}</p>
                      </section>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[#7d6b56]">
                  <p>Select a verse to view its detailed notes.</p>
                </div>
              )}
            </SheetContent>
          </Sheet>
        )}
      </main>

      <section
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 bg-[#f5f1e6]/95 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-3 shadow-[0_-6px_20px_rgba(74,63,53,0.12)] transition-transform duration-300",
          !showChrome && "translate-y-full",
        )}
      >
        <div className="px-5">
          <Slider
            value={[Math.min(currentTime, duration)]}
            max={Math.max(duration, fallbackDuration, 1)}
            step={0.1}
            onValueChange={([value]) => handleSeek(value)}
            className="w-full"
            aria-label="Song progress"
          />
          <div className="mt-1.5 flex justify-between text-[11px] text-[#7d6b56]">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration || fallbackDuration)}</span>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-3 px-5">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full text-[#4a3f35] hover:bg-[#d4c8aa]/60"
            onClick={() => handlePrevVerse()}
            aria-label="Previous verse"
          >
            <SkipBack className="h-5 w-5" />
          </Button>

          <Button
            variant="default"
            size="icon"
            className="h-12 w-12 rounded-full bg-[#a67c52] text-white shadow-xl shadow-[#a67c52]/40 hover:bg-[#8d6e4c]"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 translate-x-[1px]" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full text-[#4a3f35] hover:bg-[#d4c8aa]/60"
            onClick={() => handleNextVerse()}
            aria-label="Next verse"
          >
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-1.5 text-center text-[11px] text-[#7d6b56]">
          Verse {verses.length ? currentVerseIndex + 1 : 0} of {verses.length || 0}
        </div>

        <div className="mt-2 flex items-center justify-between px-4 text-xs">
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full border border-[#dbd0ba] bg-[#fffaf2] px-3 text-[#4a3f35] hover:bg-[#ece5d8]/80"
            onClick={handleReturnToSetup}
          >
            New Song
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full border border-[#dbd0ba] bg-[#fffaf2] px-3 text-[#4a3f35] hover:bg-[#ece5d8]/80"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? 'Hide details' : 'Details'}
          </Button>
        </div>

        {showDetails && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 px-4 pb-2 text-[11px]">
            <Badge variant="outline" className="rounded-full border-[#c0a080] bg-[#fffaf2] text-[#5c4d3f]">
              Target {targetLanguage}
            </Badge>
            <Badge variant="outline" className="rounded-full border-[#c0a080] bg-[#fffaf2] text-[#5c4d3f]">
              Model {AVAILABLE_MODELS.find((m) => m.id === selectedModelId)?.name ?? selectedModelId}
            </Badge>
            <Badge variant="outline" className="rounded-full border-[#c0a080] bg-[#fffaf2] text-[#5c4d3f]">
              {selectedFile?.name || 'Uploaded track'}
            </Badge>
            <Link href="/song-explorer" className="text-[#7d6b56] underline hover:text-[#4a3f35]">Desktop UI</Link>
          </div>
        )}

        {/* Snapshot moved to its own tab */}

        {combinedError && (
          <div className="mx-4 mb-5 rounded-2xl border border-[#b54a35]/40 bg-[#b54a35]/10 p-3 text-xs text-[#6f2b1d]">
            {initializationError && <p>{initializationError}</p>}
            {error && (!initializationError || error !== initializationError) && <p>{error}</p>}
            {processingError && (!error || processingError !== error) && <p>{processingError}</p>}
          </div>
        )}

        {/* Back to desktop link condensed into Details row */}
      </section>
    </div>
  )
}

export default MobileSongExplorerPrototype
