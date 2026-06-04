import '../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import type { Language, SongData } from '@/types'
import fallbackSeedsData from '@/data/seed-songs.json'

export const runtime = 'nodejs'

interface SeedSong {
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

export async function GET(_req: NextRequest) {
  try {
    const seeds = fallbackSeedsData.map((record) => toSeedSongFromRecord(record))
    seeds.sort((a, b) => a.title.localeCompare(b.title))
    return NextResponse.json({ seeds, count: seeds.length, source: 'manifest' })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[seeds] Error loading manifest:', msg)
    return NextResponse.json({ error: 'Failed to load seeds', details: msg }, { status: 500 })
  }
}

function toSeedSongFromRecord(record: any, cacheKey?: string): SeedSong {
  const songData = record.songData as SongData | undefined
  return {
    id: record.seedPath || record.gcsObject?.path || record.id || cacheKey || randomUUID(),
    title: songData?.title || record.title || 'Untitled',
    artist: songData?.artist || record.artist,
    originalLanguage: songData?.originalLanguage || record.originalLanguage || 'Unknown',
    targetLanguage: record.targetLanguage || 'English',
    modelId: record.modelId || 'gemini-2.5-flash',
    karaokeMode: Boolean(record.karaokeMode),
    verses: songData?.verses?.length || record.verses || 0,
    youtubeUrl: record.youtubeUrl,
    youtubeId: record.youtubeId,
    notes: record.notes,
    tags: record.tags,
    qualityTier: record.qualityTier || 'seed',
    gcsObject: record.gcsObject,
    cacheKey: cacheKey || record.cacheKey || record.id || record.gcsObject?.path,
  }
}
