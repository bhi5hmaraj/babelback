"use client"

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react"
import { Analytics } from "@vercel/analytics/react"
import {
  type Language,
  type Verse,
  type LibraryEntry,
  PracticeModeStatus,
} from "@/types"
import {
  INITIAL_PANEL_VISIBILITY,
  DEFAULT_MODEL_ID,
  AVAILABLE_MODELS,
  AI_THOUGHTS_AND_JOKES,
  SUPPORTED_LANGUAGES,
} from "@/constants"
import { trackEvent } from "@/services/analytics"
import {
  addSongToLibrary,
  deleteSongFromLibrary,
  deleteAllPracticeAttemptsForSongFromDB,
} from "@/db"
import { useAppInitializer } from "@/hooks/useAppInitializer"
import { useLibraryManager } from "@/hooks/useLibraryManager"
import {
  useSongDataManager,
  type SongProcessingResult,
} from "@/hooks/useSongDataManager"
import { useAudioPlaybackManager } from "@/hooks/useAudioPlaybackManager"
import { useDeviceManager } from "@/hooks/useDeviceManager"
import {
  useSingingPractice,
  type UseSingingPracticeReturn,
} from "@/hooks/useSingingPractice"

import SetupPanel from "@/components/song-explorer/SetupPanel"
import SongHeader from "@/components/song-explorer/SongHeader"
import LyricDisplay from "@/components/song-explorer/LyricDisplay"
import DisplayModeToggle from "@/components/song-explorer/DisplayModeToggle"
import VerseNavigation from "@/components/song-explorer/VerseNavigation"
import CosmicAudioPlayer from "@/components/song-explorer/CosmicAudioPlayer"

import AudioPlayer from "@/components/AudioPlayer"
import PracticeVersePanel from "@/components/PracticeVersePanel"
import RecordingInfoBanner from "@/components/RecordingInfoBanner"
import EarphoneConsentModal from "@/components/EarphoneConsentModal"
import LibraryView from "@/components/LibraryView"
import DeviceSelector from "@/components/DeviceSelector"
import AboutBabelback from "@/components/AboutBabelback"
import AboutPage from "@/components/AboutPage"
import TechDetailsPage from "@/components/TechDetailsPage"
import ChangelogPage from "@/components/ChangelogPage"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"

interface LyricLine {
  original: string
  transliteration?: string
  translation: string
  timestamp?: number
}

const FALLBACK_SUMMARY =
  "Upload a track to translate, transliterate, and practice with AI-guided feedback."

const SongExplorerPage: React.FC = () => {
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const singingPracticeHooksRef = useRef<UseSingingPracticeReturn | null>(null)

  const [displayMode, setDisplayMode] = useState<"synced" | "meaning">("synced")
  const [sourceMode, setSourceMode] = useState<"file" | "youtube">("youtube")
  const [selectedLocalFile, setSelectedLocalFile] = useState<File | null>(null)
  const [ytUrl, setYtUrl] = useState("")
  const [ytFormat, setYtFormat] = useState<"m4a" | "mp3">("m4a")
  const [ytWorking, setYtWorking] = useState(false)
  const [ytFun, setYtFun] = useState("")
  const [appError, setAppError] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID)
  const [currentLibraryEntryId, setCurrentLibraryEntryId] = useState<number | null>(null)
  const [panelVisibility] = useState(INITIAL_PANEL_VISIBILITY)
  const [isPracticeModeGloballyEnabled, setIsPracticeModeGloballyEnabled] =
    useState<boolean>(false)
  const [globalHasEarphoneConsent, setGlobalHasEarphoneConsent] =
    useState<boolean>(false)
  const [showDeviceSheet, setShowDeviceSheet] = useState(false)
  const [showLibrarySheet, setShowLibrarySheet] = useState(false)
  const [currentPage, setCurrentPage] = useState<"main" | "about" | "tech" | "changelog">(
    "main",
  )
  const [volume, setVolume] = useState(0.7)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)

  const {
    apiKeyMissing,
    initializationError: rawInitializationError,
    isInitializing: isAppInitializing,
  } = useAppInitializer()

  const {
    libraryEntries,
    isLoadingLibrary,
    refreshLibrary,
  } = useLibraryManager()

  const songManager = useSongDataManager({
    apiKeyMissing,
    selectedModelId,
    refreshLibraryCallback: refreshLibrary,
    practiceExitCallback: (resetGlobalConsent?: boolean) => {
      singingPracticeHooksRef.current?.exitPractice(resetGlobalConsent)
    },
  })

  const {
    audioFile,
    audioSrc,
    targetLanguage,
    songData,
    isLoading: isLoadingSongData,
    loadingMessage,
    funLoadingMessage,
    analysisProgressPercent,
    error: songProcessingError,
    isKaraokeMode,
    currentSongDurationRef,
    handleAudioSubmit: smHandleAudioSubmit,
    handleUrlAnalyze: smHandleUrlAnalyze,
    handleLanguageChange: smHandleLanguageChange,
    handleKaraokeModeToggle: smHandleKaraokeModeToggle,
    handleSongDurationAvailable: smHandleSongDurationAvailable,
    loadSongFromLibraryEntry: smLoadSongFromLibraryEntry,
    clearCurrentSong: smClearCurrentSong,
  } = songManager

  const playbackManager = useAudioPlaybackManager({ songData, audioPlayerRef })
  const {
    currentVerseIndex,
    playbackTime,
    handleTimeUpdate,
    seekToVerse,
    handleNextVerse,
    handlePrevVerse,
    setCurrentVerseIndex,
    setPlaybackTime,
  } = playbackManager

  const deviceManager = useDeviceManager()
  const {
    inputDevices,
    outputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    deviceError: rawDeviceError,
    isLoadingDevices,
    permissionGranted: devicePermissionGranted,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    requestDevicePermissions,
  } = deviceManager

  const singingPractice = useSingingPractice({
    songData,
    targetLanguage,
    currentVerseIndex,
    audioPlayerRef,
    currentSongDurationRef,
    initialHasEarphoneConsent: globalHasEarphoneConsent,
    onEarphoneConsentGlobalUpdate: setGlobalHasEarphoneConsent,
    isKaraokeMode,
    selectedInputDeviceId,
    playbackTime,
    currentLibrarySongId: currentLibraryEntryId,
    selectedModelId,
  })

  useEffect(() => {
    singingPracticeHooksRef.current = singingPractice
  }, [singingPractice])

  useEffect(() => {
    const player = audioPlayerRef.current
    if (!player) return

    const handlePlay = () => setIsAudioPlaying(true)
    const handlePause = () => setIsAudioPlaying(false)

    player.addEventListener("play", handlePlay)
    player.addEventListener("pause", handlePause)
    player.addEventListener("ended", handlePause)

    return () => {
      player.removeEventListener("play", handlePlay)
      player.removeEventListener("pause", handlePause)
      player.removeEventListener("ended", handlePause)
    }
  }, [audioSrc])

  useEffect(() => {
    const player = audioPlayerRef.current
    if (player) {
      player.volume = volume
    }
  }, [volume])

  useEffect(() => {
    if (songProcessingError) {
      setAppError(songProcessingError)
    } else if (rawDeviceError && !rawDeviceError.includes("Microphone permission")) {
      setAppError(rawDeviceError)
    } else if (rawInitializationError) {
      setAppError(rawInitializationError)
    } else {
      setAppError(null)
    }
  }, [rawInitializationError, songProcessingError, rawDeviceError])

  useEffect(() => {
    if (devicePermissionGranted) {
      if (appError && appError.includes("Microphone")) {
        setAppError(null)
      }
    }
  }, [devicePermissionGranted, appError])

  const handleAudioSubmit = useCallback(
    async (file: File) => {
      if (apiKeyMissing) {
        setAppError(rawInitializationError || "Cannot process audio: API key missing.")
        return
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current.currentTime = 0
      }
      setCurrentVerseIndex(0)
      setPlaybackTime(0)
      setCurrentLibraryEntryId(null)
      const result: SongProcessingResult | null = await smHandleAudioSubmit(file)
      if (result && result.songData && result.modelIdUsed) {
        const newLibraryEntry: Omit<LibraryEntry, "id"> = {
          title: result.songData.title || file.name,
          originalLanguage: result.songData.originalLanguage,
          targetLanguage,
          timestamp: Date.now(),
          audioFileBlob: file,
          audioFileName: file.name,
          audioFileType: file.type,
          songData: result.songData,
          processingTimeSeconds: result.processingTimeSeconds,
          songDurationSeconds: result.songDuration || undefined,
          modelIdUsed: result.modelIdUsed,
        }
        try {
          const newId = await addSongToLibrary(newLibraryEntry)
          setCurrentLibraryEntryId(newId)
          await refreshLibrary()
          trackEvent("library_song_saved", { origin: "file" })
        } catch (err) {
          console.error("[SongExplorer] Failed to save song to library", err)
          setAppError("Processed song but failed to save in local library.")
        }
      }
    },
    [
      apiKeyMissing,
      rawInitializationError,
      targetLanguage,
      smHandleAudioSubmit,
      refreshLibrary,
      setCurrentVerseIndex,
      setPlaybackTime,
    ],
  )

  const handleLanguageChange = useCallback(
    async (newLanguage: Language) => {
      if (apiKeyMissing) {
        setAppError(rawInitializationError || "Cannot change language: API key missing.")
        return
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current.currentTime = 0
      }
      setCurrentVerseIndex(0)
      setPlaybackTime(0)
      setCurrentLibraryEntryId(null)
      const result = await smHandleLanguageChange(newLanguage)
      if (result && result.songData && audioFile && result.modelIdUsed) {
        const newEntry: Omit<LibraryEntry, "id"> = {
          title: result.songData.title || audioFile.name,
          originalLanguage: result.songData.originalLanguage,
          targetLanguage: newLanguage,
          timestamp: Date.now(),
          audioFileBlob: audioFile,
          audioFileName: audioFile.name,
          audioFileType: audioFile.type,
          songData: result.songData,
          processingTimeSeconds: result.processingTimeSeconds,
          songDurationSeconds: result.songDuration || undefined,
          modelIdUsed: result.modelIdUsed,
        }
        try {
          const newId = await addSongToLibrary(newEntry)
          setCurrentLibraryEntryId(newId)
          await refreshLibrary()
        } catch (err) {
          console.error("[SongExplorer] Failed to save language reprocess", err)
          setAppError("Reprocessed song but could not save updated translation.")
        }
      }
    },
    [
      apiKeyMissing,
      rawInitializationError,
      smHandleLanguageChange,
      audioFile,
      refreshLibrary,
      setCurrentVerseIndex,
      setPlaybackTime,
    ],
  )

  const handleKaraokeModeToggle = useCallback(
    (enabled: boolean) => {
      if (enabled !== isKaraokeMode) {
        smHandleKaraokeModeToggle()
      }
    },
    [isKaraokeMode, smHandleKaraokeModeToggle],
  )

  const handleProcessYoutube = useCallback(async () => {
    if (!ytUrl || !/^https?:\/\//i.test(ytUrl)) {
      setAppError("Please paste a valid YouTube URL.")
      return
    }
    setAppError(null)
    setYtWorking(true)
    const jokes = AI_THOUGHTS_AND_JOKES
    let i = 0
    const interval = setInterval(() => {
      setYtFun(jokes[i++ % jokes.length])
    }, 2500)

    try {
      const { startDownload, getDownloadStatus } = await import("@/services/downloadsService")
      const start = await startDownload(ytUrl, ytFormat)
      let status = await getDownloadStatus(start.jobId)
      const t0 = Date.now()
      while (
        status.status !== "completed" &&
        status.status !== "failed" &&
        Date.now() - t0 < 15 * 60 * 1000
      ) {
        await new Promise((resolve) => setTimeout(resolve, 4000))
        status = await getDownloadStatus(start.jobId)
      }
      if (status.status !== "completed" || !status.url) {
        setAppError("Failed to process YouTube audio.")
        return
      }
      setYtWorking(false)
      setYtFun("")
      const result = await smHandleUrlAnalyze(status.url, {
        fileName: status.gcsObject?.path?.split("/")?.pop(),
        mimeType: status.gcsObject?.contentType,
        jobId: start.jobId,
      })
      if (result && result.songData) {
        try {
          const dummyFile = new File([], result.songData.title || "YouTube audio", {
            type: status.gcsObject?.contentType || "audio/mpeg",
          })
          const newLibraryEntry: Omit<LibraryEntry, "id"> = {
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
          const newId = await addSongToLibrary(newLibraryEntry)
          setCurrentLibraryEntryId(newId)
          await refreshLibrary()
          trackEvent("library_song_saved", { origin: "youtube" })
        } catch (err) {
          console.error("[SongExplorer] Failed to save YouTube result", err)
          setAppError("Processed YouTube audio but failed to store in library.")
        }
      }
    } catch (err) {
      console.error("[SongExplorer] YouTube processing error", err)
      setAppError(err instanceof Error ? err.message : String(err))
    } finally {
      clearInterval(interval)
      setYtWorking(false)
      setYtFun("")
    }
  }, [ytUrl, ytFormat, targetLanguage, smHandleUrlAnalyze, refreshLibrary])

  const handleLoadSongFromLibrary = useCallback(
    (entry: LibraryEntry) => {
      smLoadSongFromLibraryEntry(entry, audioPlayerRef)
      setCurrentVerseIndex(0)
      setPlaybackTime(0)
      setCurrentLibraryEntryId(entry.id)
      setSelectedModelId(entry.modelIdUsed || DEFAULT_MODEL_ID)
      setDisplayMode("synced")
      setCurrentPage("main")
      setShowLibrarySheet(false)
    },
    [smLoadSongFromLibraryEntry, setCurrentVerseIndex, setPlaybackTime],
  )

  const handleDeleteSongFromLibrary = useCallback(
    async (id: number) => {
      if (typeof window !== "undefined" && !window.confirm("Delete this song and its practice history?")) {
        return
      }
      try {
        const entryToDelete = libraryEntries.find((entry) => entry.id === id)
        await deleteSongFromLibrary(id)
        await deleteAllPracticeAttemptsForSongFromDB(id)
        await refreshLibrary()

        if (currentLibraryEntryId === id) {
          smClearCurrentSong(audioPlayerRef)
          setCurrentVerseIndex(0)
          setPlaybackTime(0)
          setCurrentLibraryEntryId(null)
        }

        if (
          songData &&
          entryToDelete &&
          audioFile &&
          entryToDelete.audioFileName === audioFile.name &&
          entryToDelete.targetLanguage === targetLanguage
        ) {
          smClearCurrentSong(audioPlayerRef)
          setCurrentVerseIndex(0)
          setPlaybackTime(0)
          setCurrentLibraryEntryId(null)
        }
      } catch (err) {
        console.error("[SongExplorer] Failed to delete library song", err)
        setAppError("Failed to delete song from library.")
      }
    },
    [
      libraryEntries,
      refreshLibrary,
      currentLibraryEntryId,
      songData,
      audioFile,
      targetLanguage,
      smClearCurrentSong,
      setCurrentVerseIndex,
      setPlaybackTime,
    ],
  )

  const handlePracticeModeGlobalToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        let hasPermission = devicePermissionGranted
        if (!hasPermission) {
          hasPermission = await requestDevicePermissions()
        }
        if (hasPermission && selectedInputDeviceId) {
          setAppError(null)
          setIsPracticeModeGloballyEnabled(true)
        } else {
          setAppError(
            rawDeviceError ||
              "Microphone access and a selected input device are required for Practice Mode.",
          )
          setIsPracticeModeGloballyEnabled(false)
        }
      } else {
        setIsPracticeModeGloballyEnabled(false)
        singingPracticeHooksRef.current?.exitPractice(true)
      }
    },
    [
      devicePermissionGranted,
      requestDevicePermissions,
      selectedInputDeviceId,
      rawDeviceError,
    ],
  )

  const handleInitiatePracticeForVerse = useCallback(
    async (verse: Verse) => {
      if (!isPracticeModeGloballyEnabled) {
        await handlePracticeModeGlobalToggle(true)
      }
      singingPracticeHooksRef.current?.initiatePracticeForVerse(verse)
    },
    [handlePracticeModeGlobalToggle, isPracticeModeGloballyEnabled],
  )

  const handleExitPractice = useCallback(() => {
    singingPracticeHooksRef.current?.exitPractice(false)
  }, [])

  useEffect(() => {
    return () => {
      if (audioSrc && audioSrc.startsWith("blob:")) {
        URL.revokeObjectURL(audioSrc)
      }
    }
  }, [audioSrc])

  const currentVerse = songData?.verses?.[currentVerseIndex]

  const lyricLines: LyricLine[] = useMemo(() => {
    if (!currentVerse) return []

    if (currentVerse.transliterationSegments?.length) {
      const segments = currentVerse.transliterationSegments
      const translations = currentVerse.translationSegments || []
      return segments.map((segment, idx) => ({
        original: segment.text,
        transliteration:
          currentVerse.original && currentVerse.original.includes("\n")
            ? currentVerse.original.split("\n")[idx] || undefined
            : undefined,
        translation: translations[idx]?.text || currentVerse.translation || "",
        timestamp: segment.startTime,
      }))
    }

    const originalLines = currentVerse.original?.split("\n") || []
    const transliterationLines = currentVerse.transliteration?.split("\n") || []
    const translationLines = currentVerse.translation?.split("\n") || []
    const maxLength = Math.max(
      originalLines.length,
      transliterationLines.length,
      translationLines.length,
      1,
    )
    const lines: LyricLine[] = []
    for (let idx = 0; idx < maxLength; idx += 1) {
      const originalLine = originalLines[idx]
      const translitLine = transliterationLines[idx]
      const translationLine = translationLines[idx]
      lines.push({
        original: originalLine || translitLine || "",
        transliteration: originalLine && translitLine ? translitLine : undefined,
        translation: translationLine || "",
      })
    }
    return lines
  }, [currentVerse])

  const statusMessage = useMemo(() => {
    if (ytWorking) return ytFun || "Fetching audio from YouTube..."
    if (loadingMessage) return loadingMessage
    if (funLoadingMessage) return funLoadingMessage
    if (analysisProgressPercent != null) {
      return `Analyzing song... ${analysisProgressPercent}%`
    }
    return undefined
  }, [ytWorking, ytFun, loadingMessage, funLoadingMessage, analysisProgressPercent])

  const isPracticeActive =
    singingPractice.practiceVerseStatus !== PracticeModeStatus.IDLE &&
    singingPractice.practiceVerseStatus !== PracticeModeStatus.CONSENT_GIVEN

  const globalIsLoading =
    isLoadingSongData || isLoadingDevices || isAppInitializing || ytWorking

  const canTogglePractice = Boolean(
    songData?.verses?.length &&
      currentLibraryEntryId &&
      (selectedInputDeviceId || devicePermissionGranted),
  )

  const handlePlayPause = useCallback(() => {
    const player = audioPlayerRef.current
    if (!player) return
    if (player.paused) {
      player
        .play()
        .catch((err) => {
          console.error("[SongExplorer] play() failed", err)
          setAppError(`Playback failed: ${err instanceof Error ? err.message : err}`)
        })
    } else {
      player.pause()
    }
  }, [])

  const handleSeek = useCallback((time: number) => {
    if (!audioPlayerRef.current) return
    audioPlayerRef.current.currentTime = time
    setPlaybackTime(time)
  }, [setPlaybackTime])

  const handleVolumeChange = useCallback((nextVolume: number) => {
    setVolume(nextVolume)
  }, [])

  const currentSongSummary = songData?.summary || FALLBACK_SUMMARY
  const currentSongArtist = songData?.originalLanguage
    ? `${songData.originalLanguage} → ${targetLanguage}`
    : "Multilingual"

  const languageOptions = useMemo(
    () =>
      SUPPORTED_LANGUAGES.map((lang) => ({
        value: lang,
        label: lang,
      })),
    [],
  )

  const modelOptions = useMemo(
    () =>
      AVAILABLE_MODELS.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
      })),
    [],
  )

  const handleSetVerseFromNavigation = useCallback(
    (verseNumber: number) => {
      seekToVerse(verseNumber - 1)
      setCurrentVerseIndex(Math.max(0, verseNumber - 1))
      setDisplayMode("synced")
    },
    [seekToVerse, setCurrentVerseIndex],
  )

  const renderPracticePanel = () => {
    if (!isPracticeModeGloballyEnabled) return null
    if (singingPractice.practiceVerseStatus === PracticeModeStatus.IDLE) return null

    return (
      <PracticeVersePanel
        practiceTargetVerses={singingPractice.activePracticeVerses}
        status={singingPractice.practiceVerseStatus}
        score={singingPractice.practiceScore}
        error={singingPractice.practiceError}
        recordedAudioUrl={singingPractice.userPracticeAudioUrl}
        onStartRecording={singingPractice.startRecording}
        onStopRecording={singingPractice.stopRecording}
        onTryAgain={singingPractice.tryAgainPractice}
        onSubmitForScoring={singingPractice.submitForScoring}
        onExit={handleExitPractice}
        currentTimeForHighlight={playbackTime}
        isKaraokeModeEnabled={isKaraokeMode}
        recordingFormattedTime={singingPractice.recordingFormattedTime}
        originalSongDataForDisplay={songData}
      />
    )
  }

  const renderAuxTabs = () => (
    <Card className="glass-card p-6">
      <Tabs value={currentPage} onValueChange={(value) => setCurrentPage(value as typeof currentPage)}>
        <TabsList className="glass-card grid grid-cols-4">
          <TabsTrigger value="main">Workspace</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="tech">Tech</TabsTrigger>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
        </TabsList>
        <TabsContent value="main" className="pt-6 space-y-4 text-sm text-muted-foreground">
          <AboutBabelback />
        </TabsContent>
        <TabsContent value="about" className="pt-6">
          <ScrollArea className="max-h-[60vh] pr-2">
            <AboutPage />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="tech" className="pt-6">
          <ScrollArea className="max-h-[60vh] pr-2">
            <TechDetailsPage />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="changelog" className="pt-6">
          <ScrollArea className="max-h-[60vh] pr-2">
            <ChangelogPage />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Card>
  )

  return (
    <div className="cosmic-bg min-h-screen">
      <div className="container mx-auto px-4 py-10 lg:py-16 pb-8">
        <SongHeader
          title={songData?.title}
          artist={currentSongArtist}
          description={currentSongSummary}
          language={songData?.originalLanguage || ""}
          isPlaceholder={!songData}
        />

        {statusMessage && (
          <Alert className="glass-card mb-8">
            <AlertDescription className="flex items-center gap-2 text-sm">
              <Badge variant="secondary" className="bg-primary-gradient text-primary-foreground">
                Live status
              </Badge>
              {statusMessage}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <div className="space-y-6">
            <RecordingInfoBanner
              isVisible={
                singingPractice.practiceVerseStatus === PracticeModeStatus.RECORDING
              }
            />

            <Card className="glass-card p-6 space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Verse {currentVerse?.verseNumber ?? "—"}
                  </p>
                  <h2 className="text-xl font-semibold text-foreground">
                    {currentVerse ? `Timing ${new Date(currentVerse.startTime * 1000).toISOString().substr(14, 5)} → ${new Date(currentVerse.endTime * 1000).toISOString().substr(14, 5)}` : "Load a verse to begin"}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {songData?.verses?.length ? (
                    <Badge variant="secondary" className="bg-accent-gradient text-accent-foreground">
                      {songData.verses.length} verses analyzed
                    </Badge>
                  ) : null}
                </div>
              </div>

              <DisplayModeToggle
                activeMode={displayMode}
                onModeChange={setDisplayMode}
                disabled={!currentVerse}
              />

              <LyricDisplay
                title={currentVerse ? `Verse ${currentVerse.verseNumber}` : undefined}
                subtitle={
                  currentVerse
                    ? `${songData?.originalLanguage || "Original"} → ${targetLanguage}`
                    : undefined
                }
                lyrics={lyricLines}
                meaning={currentVerse?.meaning}
                currentTime={playbackTime}
                displayMode={displayMode}
                isLoading={isLoadingSongData}
              />

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <VerseNavigation
                  currentVerse={(currentVerseIndex || 0) + 1}
                  totalVerses={songData?.verses?.length || 0}
                  onVerseChange={handleSetVerseFromNavigation}
                  disabled={!songData?.verses?.length}
                />
                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="touch-button rounded-xl"
                    disabled={!songData || isPracticeActive}
                    onClick={() => currentVerse && handleInitiatePracticeForVerse(currentVerse)}
                  >
                    Practice this verse
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="touch-button rounded-xl"
                    disabled={!songData}
                    onClick={() => setDisplayMode(displayMode === "synced" ? "meaning" : "synced")}
                  >
                    Toggle Meaning
                  </Button>
                </div>
              </div>
            </Card>

            {renderPracticePanel()}

            {renderAuxTabs()}
          </div>

          <div className="space-y-6">
            <SetupPanel
              sourceMode={sourceMode}
              onSourceModeChange={setSourceMode}
              selectedFileName={selectedLocalFile?.name || null}
              onSelectLocalFile={(file) => {
                setSelectedLocalFile(file)
                setSourceMode("file")
              }}
              onProcessLocalFile={async () => {
                if (selectedLocalFile) {
                  await handleAudioSubmit(selectedLocalFile)
                }
              }}
              youtubeUrl={ytUrl}
              onYoutubeUrlChange={setYtUrl}
              youtubeFormat={ytFormat}
              onYoutubeFormatChange={setYtFormat}
              onProcessYoutube={handleProcessYoutube}
              isProcessing={isLoadingSongData || ytWorking}
              isInitializing={isAppInitializing}
              isDisabled={globalIsLoading}
              statusMessage={statusMessage}
              errorMessage={appError}
              selectedModelId={selectedModelId}
              onModelChange={setSelectedModelId}
              models={modelOptions}
              targetLanguage={targetLanguage}
              languages={languageOptions}
              onLanguageChange={handleLanguageChange}
              isKaraokeMode={isKaraokeMode}
              onToggleKaraoke={handleKaraokeModeToggle}
              isPracticeModeEnabled={isPracticeModeGloballyEnabled}
              onTogglePractice={handlePracticeModeGlobalToggle}
              canTogglePractice={canTogglePractice}
              onOpenLibrary={() => setShowLibrarySheet(true)}
              libraryCount={libraryEntries.length}
              apiKeyMissing={apiKeyMissing}
              onOpenDeviceSettings={() => setShowDeviceSheet(true)}
              devicePermissionGranted={devicePermissionGranted}
              deviceStatusMessage={rawDeviceError}
            />

            <Card className="glass-card p-6 space-y-3 text-sm text-muted-foreground">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Badge variant="secondary" className="bg-primary-gradient text-primary-foreground">
                  Tips
                </Badge>
                Keep the flow smooth
              </h3>
              <p>
                Switch between Focus and Workspace layouts by resizing your window. On mobile, lyrics take center stage; on desktop you get side-by-side controls.
              </p>
              <p>
                Learning a new song? Start by analyzing, then enable Practice Mode to record and score individual verses.
              </p>
            </Card>
          </div>
        </div>

        <Card className="glass-card p-6 mt-10 mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Playback</h3>
              <p className="text-sm text-muted-foreground">
                Use the cosmic transport to scrub verses, or let auto-scroll keep the active line centered.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Volume {Math.round(volume * 100)}%</Badge>
              {audioSrc ? (
                <Badge variant="outline">Duration {Math.round(currentSongDurationRef.current || 0)}s</Badge>
              ) : null}
            </div>
          </div>

          <CosmicAudioPlayer
            currentTime={playbackTime}
            duration={currentSongDurationRef.current || 0}
            isPlaying={isAudioPlaying}
            onPlayPause={handlePlayPause}
            onSkipPrevious={() => handlePrevVerse()}
            onSkipNext={() => handleNextVerse()}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            volume={volume}
            disabled={!audioSrc}
          />

          <AudioPlayer
            src={audioSrc || null}
            onTimeUpdate={handleTimeUpdate}
            setAudioElement={(el) => {
              audioPlayerRef.current = el
            }}
            onLoadedData={() => {
              if (audioPlayerRef.current) {
                setIsAudioPlaying(!audioPlayerRef.current.paused)
              }
            }}
            onDurationAvailable={(duration) => {
              currentSongDurationRef.current = duration
            }}
            outputDeviceId={selectedOutputDeviceId}
            compact
            className="hidden"
          />
        </Card>
      </div>

      <Sheet open={showLibrarySheet} onOpenChange={setShowLibrarySheet}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Song Library</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[80vh] pr-4">
            <LibraryView
              entries={libraryEntries}
              onLoadSong={handleLoadSongFromLibrary}
              onDeleteSong={handleDeleteSongFromLibrary}
              currentPlayingLibraryId={currentLibraryEntryId}
            />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Sheet open={showDeviceSheet} onOpenChange={setShowDeviceSheet}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Audio Device Configuration</SheetTitle>
          </SheetHeader>
          <Separator className="my-4" />
          <DeviceSelector
            inputDevices={inputDevices}
            outputDevices={outputDevices}
            selectedInputDeviceId={selectedInputDeviceId}
            selectedOutputDeviceId={selectedOutputDeviceId}
            onSelectInputDevice={setSelectedInputDeviceId}
            onSelectOutputDevice={setSelectedOutputDeviceId}
            onRequestPermissions={requestDevicePermissions}
            permissionGranted={devicePermissionGranted}
            isLoading={isLoadingDevices}
            disabled={false}
            error={rawDeviceError}
          />
        </SheetContent>
      </Sheet>

      <EarphoneConsentModal
        isOpen={singingPractice.showEarphoneModal}
        onConfirm={singingPractice.confirmEarphoneConsent}
        onCancel={singingPractice.cancelEarphoneConsent}
      />

      <Analytics />
    </div>
  )
}

export default SongExplorerPage
