"use client"

import React, { useState, useEffect } from "react"
import Icon from "./Icon"
import LoadingSpinner from "./LoadingSpinner"
import type { Language, SeedSongPayload, SongData } from "../types"

type SeedSong = {
  id: string
  title: string
  artist?: string
  originalLanguage: Language
  targetLanguage: Language
  modelId: string
  karaokeMode: boolean
  verses: number
  youtubeUrl?: string
  youtubeId?: string
  notes?: string
  tags?: string[]
  qualityTier?: string
  gcsObject: {
    bucket: string
    path: string
  }
  cacheKey: string
}

interface SeedLibraryViewProps {
  onLoadSeed: (cacheKey: string, payload: SeedSongPayload) => void
  title?: string | null
  description?: string | null
}

const SeedLibraryView: React.FC<SeedLibraryViewProps> = ({ onLoadSeed, title, description }) => {
  const resolvedTitle = title === undefined ? "Seed Songs" : title
  const resolvedDescription = description === undefined ? "Pre-analyzed songs for instant playback. No processing required!" : description
  const [seeds, setSeeds] = useState<SeedSong[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingSeeds, setLoadingSeeds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    void fetchSeeds()
  }, [])

  const fetchSeeds = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch("/api/seeds")
      if (!response.ok) {
        throw new Error(`Failed to fetch seeds: ${response.status}`)
      }

      const data = await response.json()
      setSeeds(data.seeds || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("Failed to fetch seed songs:", err)
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadSeed = async (seed: SeedSong) => {
    try {
      setLoadingSeeds((prev) => ({ ...prev, [seed.id]: true }))

      const response = await fetch(`/api/seeds/${encodeURIComponent(seed.cacheKey)}`)
      if (!response.ok) {
        throw new Error(`Failed to load seed: ${response.status}`)
      }

      const data = await response.json()

      const payload: SeedSongPayload = {
        songData: data.songData as SongData,
        audioUrl: data.audioUrl || data.youtubeUrl,
        youtubeUrl: data.youtubeUrl,
        targetLanguage: data.targetLanguage as Language | undefined,
        modelId: data.modelId,
        karaokeMode: data.karaokeMode,
        tags: data.tags,
        gcsObject: data.gcsObject,
      }

      if (!payload.songData || !payload.audioUrl) {
        throw new Error("Seed payload is missing audio or analyzed song data.")
      }

      onLoadSeed(seed.cacheKey, payload)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("Failed to load seed song:", err)
      alert(`Failed to load song: ${msg}`)
    } finally {
      setLoadingSeeds((prev) => ({ ...prev, [seed.id]: false }))
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-[#7d6b56]">
        <LoadingSpinner />
        <p>Loading suggestions...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#b54a35]/30 bg-[#ffe8e1] p-4 text-sm text-[#6f2b1d]">
        <div className="flex items-center gap-2 font-semibold">
          <Icon name="warning-circle" weight="duotone" />
          Failed to load suggestions
        </div>
        <p className="mt-1">{error}</p>
        <button
          onClick={fetchSeeds}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#b54a35] px-3 py-1 text-xs font-semibold text-[#b54a35] hover:bg-[#b54a35]/10"
        >
          <Icon name="arrow-clockwise" className="h-3 w-3" /> Try again
        </button>
      </div>
    )
  }

  if (seeds.length === 0) {
    return (
      <div className="rounded-xl border border-[#dbd0ba] bg-white/70 p-4 text-sm text-[#7d6b56]">
        <Icon name="music-notes-simple" weight="duotone" size="xl" className="mb-2 text-[#a67c52]" />
        <p className="font-semibold text-[#4a3f35]">No suggestions yet</p>
        <p className="text-xs">Seed songs provide instant playback without processing -- check back soon.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {(resolvedTitle || resolvedDescription) && (
        <div className="space-y-1">
          {resolvedTitle && (
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#4a3f35]">
              <Icon name="sparkle" weight="duotone" className="text-[#a67c52]" />
              {resolvedTitle}
            </h2>
          )}
          {resolvedDescription && <p className="text-xs text-[#7d6b56]">{resolvedDescription}</p>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.28em] text-[#b19a7c]">Curated seeds</span>
        <button
          onClick={fetchSeeds}
          className="inline-flex items-center gap-2 rounded-full border border-[#c0a080] px-3 py-1 text-xs font-semibold text-[#7d6b56] hover:bg-[#f0e6d4]"
          aria-label="Refresh seed songs"
        >
          <Icon name="arrow-clockwise" className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {seeds.map((seed) => (
          <div
            key={seed.id}
            className="flex flex-col gap-3 rounded-xl border border-[#dbd0ba] bg-[#fffaf2] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-[#4a3f35]">{seed.title}</h3>
              {seed.artist && <p className="text-xs text-[#7d6b56]">{seed.artist}</p>}
              <div className="flex flex-wrap gap-3 text-[11px] text-[#7d6b56]">
                <span className="inline-flex items-center gap-1">
                  <Icon name="translate" weight="bold" className="h-3 w-3" />
                  {seed.originalLanguage} → {seed.targetLanguage}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Icon name="list-numbers" weight="bold" className="h-3 w-3" />
                  {seed.verses} verses
                </span>
                <span className="inline-flex items-center gap-1">
                  <Icon name="microphone-stage" weight="bold" className="h-3 w-3" />
                  {seed.karaokeMode ? "Karaoke" : "Standard"}
                </span>
              </div>

              {seed.tags && seed.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {seed.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="rounded-full border border-[#c0a080] bg-[#f5efe0] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[#7d6b56]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {seed.notes && (
                <p className="text-[11px] italic text-[#8c7a63]">"{seed.notes}"</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleLoadSeed(seed)}
                disabled={loadingSeeds[seed.id]}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#a67c52] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#8d6e4c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingSeeds[seed.id] ? (
                  <>
                    <Icon name="spinner-gap" className="animate-spin" /> Loading...
                  </>
                ) : (
                  <>
                    <Icon name="play-circle" weight="bold" className="h-3 w-3" /> Load
                  </>
                )}
              </button>
              {seed.youtubeUrl && (
                <a
                  href={seed.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-[#dbd0ba] px-3 py-2 text-xs font-semibold text-[#7d6b56] hover:bg-[#f0e6d4]"
                  aria-label="View on YouTube"
                >
                  <Icon name="youtube-logo" className="h-3 w-3" /> View
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SeedLibraryView
