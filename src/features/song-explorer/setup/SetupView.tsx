"use client"
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import LoadingSpinner from '@/components/LoadingSpinner'
import LanguageSelector from '@/components/LanguageSelector'
import type { SeedSongPayload, Language } from '@/types'
import { cn } from '@/lib/utils'

export interface SetupViewProps {
  isBusy: boolean
  apiKeyMissing: boolean
  error: string | null
  onProcessFile: (file: File) => Promise<any>
  onProcessYoutube: (url: string) => Promise<any>
  onLoadSeed: (cacheKey: string, seed: SeedSongPayload) => Promise<void>
  targetLanguage: Language
  onLanguageSelect: (lang: Language) => void
  selectedModelId?: string
  onModelSelect?: (modelId: string) => void
  loadingMessage?: string | null
  funLoadingMessage?: string
}

export function SetupView({ isBusy, apiKeyMissing, error, onProcessFile, onProcessYoutube, onLoadSeed: _onLoadSeed, targetLanguage, onLanguageSelect, selectedModelId, onModelSelect, loadingMessage, funLoadingMessage }: SetupViewProps) {
  const [sourceMode, setSourceMode] = React.useState<'file' | 'youtube'>('file')
  const [file, setFile] = React.useState<File | null>(null)
  const [ytUrl, setYtUrl] = React.useState('')
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const handleGo = async () => {
    if (apiKeyMissing || isBusy) return
    if (sourceMode === 'file') {
      if (!file) return
      await onProcessFile(file)
    } else {
      if (!ytUrl) return
      await onProcessYoutube(ytUrl)
    }
  }

  const primaryMessage = loadingMessage || (isBusy ? (sourceMode === 'file' ? 'Uploading your song…' : 'Preparing your link…') : null)
  const playfulMessage = isBusy ? funLoadingMessage : undefined

  return (
    <div className={cn('parchment-shell min-h-screen pb-24 text-[#4a3f35]')}>
      <div className="safe-top" />
      <div className="mx-auto mt-12 w-full max-w-xl rounded-[32px] parchment-card p-8 shadow-[0_20px_45px_rgba(74,63,53,0.15)] backdrop-blur">
        <h1 className="mt-1 text-3xl font-semibold">Start a New Session</h1>

        <div className="mt-8 flex items-center justify-center gap-3 rounded-full border border-[#dbd0ba] bg-[#fffaf2] p-1">
          <button
            type="button"
            onClick={() => setSourceMode('file')}
            className={cn('flex-1 rounded-full px-4 py-2 text-sm font-medium transition', sourceMode === 'file' ? 'bg-[#a67c52] text-white shadow-lg' : 'text-[#7d6b56] hover:text-[#4a3f35]')}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setSourceMode('youtube')}
            className={cn('flex-1 rounded-full px-4 py-2 text-sm font-medium transition', sourceMode === 'youtube' ? 'bg-[#a67c52] text-white shadow-lg' : 'text-[#7d6b56] hover:text-[#4a3f35]')}
          >
            YouTube Link
          </button>
        </div>

        <div className="mt-6 space-y-6">
          {onModelSelect && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <select
                data-testid="model-select"
                className="w-full rounded-lg border border-[#dbd0ba] bg-[#fffaf2] p-2 text-sm"
                value={selectedModelId}
                onChange={(e) => onModelSelect?.(e.target.value)}
                disabled={isBusy}
              >
                {require('@/constants').AVAILABLE_MODELS.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className={cn('space-y-3', sourceMode !== 'file' && 'pointer-events-none opacity-50')}>
            <label className="text-sm font-medium">Audio File</label>
            <Input
              ref={fileRef}
              type="file"
              accept="audio/*"
              disabled={isBusy}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <div className={cn('space-y-3', sourceMode !== 'youtube' && 'pointer-events-none opacity-50')}>
            <label className="text-sm font-medium">YouTube Link</label>
            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              disabled={isBusy}
            />
          </div>
          <LanguageSelector
            className="pt-2"
            selectedLanguage={targetLanguage}
            onLanguageChange={onLanguageSelect}
            disabled={isBusy}
            label="Translate to"
          />
        </div>

        <Button
          data-testid="babelback-button"
          className="mt-6 w-full rounded-full bg-[#a67c52] py-4 text-base font-semibold text-white shadow-lg shadow-[#a67c52]/40 transition hover:bg-[#8d6e4c]"
          disabled={apiKeyMissing || isBusy}
          onClick={handleGo}
        >
          {isBusy ? 'Processing…' : 'BabelBack!'}
        </Button>

        {(primaryMessage || playfulMessage) && (
          <div className="mt-4">
            <LoadingSpinner
              message={primaryMessage ?? undefined}
              funMessage={playfulMessage}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-[#b54a35]/40 bg-[#b54a35]/10 p-3 text-xs text-[#6f2b1d]">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default SetupView
