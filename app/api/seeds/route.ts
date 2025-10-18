import '../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getRedis } from '../_lib/redis'
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

/**
 * GET /api/seeds
 * Returns list of available seed songs from Redis
 */
export async function GET(req: NextRequest) {
  try {
    const redis = await getRedis()
    if (!redis) {
      const fallback = fallbackSeedsData.map(toSeedSongFromRecord)
      fallback.sort((a, b) => a.title.localeCompare(b.title))
      console.log('[seeds] Redis unavailable, serving', fallback.length, 'seed songs from static cache')
      return NextResponse.json({ seeds: fallback, count: fallback.length, source: 'static' })
    }

    // Get all analysis cache keys that are seeds
    const allKeys = await redis.keys('analysis:gcs:*')
    const seeds: SeedSong[] = []

    for (const key of allKeys) {
      try {
        const raw = await redis.get(key)
        if (!raw) continue

        const record = JSON.parse(raw)

        // Only include seeds
        if (!record.isSeed) continue

        seeds.push(toSeedSongFromRecord(record, key))
      } catch (err) {
        console.error('[seeds] Failed to parse seed:', key, err)
      }
    }

    // Sort by title
    seeds.sort((a, b) => a.title.localeCompare(b.title))

    console.log('[seeds] Returning', seeds.length, 'seed songs')

    return NextResponse.json({ seeds, count: seeds.length, source: 'redis' })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[seeds] Error fetching seeds:', msg)
    return NextResponse.json({ error: 'Failed to fetch seed songs', details: msg }, { status: 500 })
  }
}

function toSeedSongFromRecord(record: any, cacheKey?: string): SeedSong {
  const songData = (record.songData ?? record.songData) as SongData | undefined
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
