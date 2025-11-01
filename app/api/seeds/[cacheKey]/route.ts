import '../../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { getStorageProvider } from '../../_lib/storage'
import fallbackSeedsData from '@/data/seed-songs.json'
import type { SongData } from '@/types'

export const runtime = 'nodejs'

/**
 * GET /api/seeds/[cacheKey]
 * Returns full song data for a specific seed with signed audio URL
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ cacheKey: string }> | { cacheKey: string } }
) {
  try {
    const resolvedParams = await context.params
    const cacheKey = decodeURIComponent(resolvedParams.cacheKey)
    const fallback = fallbackSeedsData.find((seed) => seed.id === cacheKey || seed.gcsObject?.path === cacheKey)
    if (!fallback) {
      return NextResponse.json({ error: 'Seed not found' }, { status: 404 })
    }
    return NextResponse.json(await buildSeedResponse(fallback))
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[seeds:load] Error loading seed:', msg)
    return NextResponse.json({ error: 'Failed to load seed', details: msg }, { status: 500 })
  }
}

async function buildSeedResponse(record: any) {
  const songData = record.songData as SongData | undefined
  let audioUrl: string | undefined
  if (record.gcsObject?.bucket && record.gcsObject?.path) {
    try {
      const storage = getStorageProvider()
      audioUrl = await storage.getSignedReadUrl(record.gcsObject.bucket, record.gcsObject.path)
    } catch (err) {
      console.error('[seeds:load] Failed to generate signed URL:', err)
    }
  }
  if (!audioUrl) {
    audioUrl = record.audioUrl || record.youtubeUrl
  }

  console.log('[seeds:load] Loaded seed:', songData?.title || record.title || 'Untitled')

  return {
    songData,
    audioUrl,
    gcsObject: record.gcsObject,
    targetLanguage: record.targetLanguage,
    modelId: record.modelId,
    karaokeMode: record.karaokeMode,
    youtubeUrl: record.youtubeUrl,
    youtubeId: record.youtubeId,
    notes: record.notes,
    tags: record.tags,
  }
}
