"use client"

import React, { useRef } from "react"
import {
  Upload,
  Settings,
  Music,
  PlayCircle,
  FileAudio,
  Sparkles,
  Youtube,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import type { Language } from "@/types"

interface ModelOption {
  id: string
  name: string
  description?: string
}

interface LanguageOption {
  value: Language
  label: string
}

interface SetupPanelProps {
  sourceMode: "file" | "youtube"
  onSourceModeChange: (mode: "file" | "youtube") => void

  selectedFileName: string | null
  onSelectLocalFile: (file: File) => void
  onProcessLocalFile: () => Promise<void>

  youtubeUrl: string
  onYoutubeUrlChange: (value: string) => void
  youtubeFormat: "m4a" | "mp3"
  onYoutubeFormatChange: (value: "m4a" | "mp3") => void
  onProcessYoutube: () => Promise<void>

  isProcessing: boolean
  isInitializing: boolean
  isDisabled: boolean
  statusMessage?: string
  errorMessage?: string | null

  selectedModelId: string
  onModelChange: (modelId: string) => void
  models: ModelOption[]

  targetLanguage: Language
  languages: LanguageOption[]
  onLanguageChange: (lang: Language) => void

  isKaraokeMode: boolean
  onToggleKaraoke: (enabled: boolean) => void
  isPracticeModeEnabled: boolean
  onTogglePractice: (enabled: boolean) => void
  canTogglePractice: boolean

  onOpenLibrary: () => void
  libraryCount: number

  apiKeyMissing: boolean
  onOpenDeviceSettings?: () => void
  devicePermissionGranted?: boolean
  deviceStatusMessage?: string | null
}

const SetupPanel: React.FC<SetupPanelProps> = ({
  sourceMode,
  onSourceModeChange,
  selectedFileName,
  onSelectLocalFile,
  onProcessLocalFile,
  youtubeUrl,
  onYoutubeUrlChange,
  youtubeFormat,
  onYoutubeFormatChange,
  onProcessYoutube,
  isProcessing,
  isInitializing,
  isDisabled,
  statusMessage,
  errorMessage,
  selectedModelId,
  onModelChange,
  models,
  targetLanguage,
  languages,
  onLanguageChange,
  isKaraokeMode,
  onToggleKaraoke,
  isPracticeModeEnabled,
  onTogglePractice,
  canTogglePractice,
  onOpenLibrary,
  libraryCount,
  apiKeyMissing,
  onOpenDeviceSettings,
  devicePermissionGranted,
  deviceStatusMessage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onSelectLocalFile(file)
    }
  }

  const handleProcessFile = async () => {
    if (isDisabled || isProcessing || !selectedFileName) return
    await onProcessLocalFile()
  }

  const handleProcessYoutube = async () => {
    if (isDisabled || isProcessing || !youtubeUrl) return
    await onProcessYoutube()
  }

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="section-header mb-1 flex items-center gap-2">
              <Music className="h-5 w-5" />
              Source & Settings
            </h2>
            <p className="text-sm text-muted-foreground">
              Upload audio, choose AI options, and jump back into your synced lyric workspace.
            </p>
          </div>
          <Button
            onClick={onOpenLibrary}
            disabled={isDisabled}
            className="bg-primary-gradient hover:shadow-glow gap-2 rounded-xl"
          >
            <PlayCircle className="h-4 w-4" />
            View Library
            <Badge variant="secondary" className="ml-2 bg-card/60">
              {libraryCount}
            </Badge>
          </Button>
        </div>

        <Tabs value={sourceMode} onValueChange={(value) => onSourceModeChange(value as "file" | "youtube") }>
          <TabsList className="grid w-full grid-cols-2 glass-card mb-6">
            <TabsTrigger value="file" className="data-[state=active]:bg-primary-gradient">
              Upload File
            </TabsTrigger>
            <TabsTrigger value="youtube" className="data-[state=active]:bg-accent-gradient">
              YouTube Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-foreground/90">
                  Audio file
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isDisabled}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="touch-button gap-2 rounded-xl flex-1 justify-start bg-background/40"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isDisabled}
                  >
                    <FileAudio className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">
                      {selectedFileName || "Choose audio file..."}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    onClick={handleProcessFile}
                    disabled={
                      isDisabled || apiKeyMissing || isProcessing || !selectedFileName
                    }
                    className="bg-primary-gradient hover:shadow-glow gap-2 rounded-xl"
                  >
                    <Upload className="h-4 w-4" />
                    {isProcessing ? "Processing" : "Analyze"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  We send your audio to Gemini for transcription, translation, and verse-level alignment.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="youtube" className="space-y-4">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-foreground/90">
                Paste a YouTube URL
              </label>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="relative">
                      <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={youtubeUrl}
                        onChange={(event) => onYoutubeUrlChange(event.target.value)}
                        disabled={isDisabled}
                        className={cn(
                          "w-full rounded-xl border border-border/30 bg-background/70 px-9 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary",
                          isDisabled && "opacity-60"
                        )}
                      />
                    </div>
                  </div>
                  <Select
                    value={youtubeFormat}
                    onValueChange={(value: "m4a" | "mp3") => onYoutubeFormatChange(value)}
                    disabled={isDisabled}
                  >
                    <SelectTrigger className="w-28 rounded-xl border border-border/30 bg-background/70 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-border/30">
                      <SelectItem value="m4a">M4A</SelectItem>
                      <SelectItem value="mp3">MP3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleProcessYoutube}
                    disabled={
                      isDisabled || apiKeyMissing || isProcessing || youtubeUrl.trim().length === 0
                    }
                    className="bg-accent-gradient hover:shadow-glow gap-2 rounded-xl"
                  >
                    <Sparkles className="h-4 w-4" />
                    {isProcessing ? "Fetching" : "Analyze Link"}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                We run yt-dlp through Apify, normalize audio, then pass it to Gemini for the same lyric workflow.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {(statusMessage || apiKeyMissing) && (
          <Alert className="mt-4 glass-card border-border/40">
            <AlertTitle>{apiKeyMissing ? "Gemini API key missing" : "Working on it"}</AlertTitle>
            <AlertDescription className="text-sm">
              {apiKeyMissing
                ? "Add GEMINI_API_KEY to your environment to enable analysis."
                : statusMessage}
            </AlertDescription>
          </Alert>
        )}

        {errorMessage && (
          <Alert variant="destructive" className="mt-4 bg-destructive/10 border-destructive/40">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription className="text-sm">
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}
      </Card>

      <Card className="glass-card p-6 space-y-6">
        <h3 className="section-header flex items-center gap-2">
          <Settings className="h-5 w-5" />
          AI & Playback Options
        </h3>

        <div className="grid gap-6">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground/90">
              AI model
            </label>
            <Select value={selectedModelId} onValueChange={onModelChange} disabled={isDisabled || isProcessing}>
              <SelectTrigger className="glass-card border border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-card border-border/30">
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{model.name}</span>
                      {model.description && (
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Switching models will re-process the currently loaded song once the analysis finishes.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground/90">
              Translate into
            </label>
            <Select
              value={targetLanguage}
              onValueChange={(value) => onLanguageChange(value as Language)}
              disabled={isDisabled || isProcessing}
            >
              <SelectTrigger className="glass-card border border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-card border-border/30">
                {languages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 glass-card rounded-xl">
              <div>
                <h4 className="font-medium text-foreground">Karaoke mode</h4>
                <p className="text-sm text-muted-foreground">
                  Highlights transliteration segments on the beat.
                </p>
              </div>
              <Switch
                checked={isKaraokeMode}
                onCheckedChange={onToggleKaraoke}
                disabled={isDisabled || isProcessing}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            <div className="flex items-center justify-between p-4 glass-card rounded-xl">
              <div>
                <h4 className="font-medium text-foreground">Practice mode</h4>
                <p className="text-sm text-muted-foreground">
                  Record vocals and get AI feedback once a verse is selected.
                </p>
              </div>
              <Switch
                checked={isPracticeModeEnabled}
                onCheckedChange={onTogglePractice}
                disabled={isDisabled || !canTogglePractice || isProcessing}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="glass-card p-6">
        <h3 className="section-header">Workspace quick facts</h3>
        <div className="grid gap-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Status</p>
              <p>{isInitializing ? "Preparing environment..." : isProcessing ? "Processing audio with Gemini..." : "Ready for your next song."}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Music className="h-4 w-4 text-accent mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Songs in library</p>
              <p>{libraryCount > 0 ? `${libraryCount} saved locally` : "No saved songs yet."}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Settings className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-foreground">Audio devices</p>
              <p>
                {deviceStatusMessage ||
                  (devicePermissionGranted
                    ? "Microphone ready for practice recordings."
                    : "Grant microphone access to enable practice mode feedback.")}
              </p>
              {onOpenDeviceSettings && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-3 touch-button bg-background/30 hover:bg-background/60"
                  onClick={onOpenDeviceSettings}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configure Devices
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default SetupPanel
