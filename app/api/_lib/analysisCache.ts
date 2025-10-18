/**
 * Analysis Cache Layer
 *
 * Provides caching for song analysis results using Redis.
 * Cache key is based on GCS object path + analysis parameters.
 */

import crypto from 'node:crypto'
import { redisGet, redisSet } from './redis'
import type { Language } from '@/types'

const CACHE_VERSION = '1.0.0'
const ANALYSIS_CACHE_TTL = 30 * 24 * 60 * 60 // 30 days in seconds
const SEED_CACHE_TTL = 0 // No expiry for seeds

// --- Types ---

export interface GCSObject {
  bucket: string
  path: string
  contentType?: string
  size?: number
}

export interface AnalysisCacheRecord {
  // Cache metadata
  cacheKey: string
  cacheVersion: string
  cachedAt: number
  ttl: number

  // GCS object identifier (PRIMARY KEY for cache)
  gcsObject: GCSObject
  objectKey: string // Normalized: "{bucket}/{path}"

  // Analysis parameters (part of cache key)
  targetLanguage: Language
  modelId: string
  karaokeMode: boolean

  // Source metadata (for debugging/display)
  sourceType: 'youtube' | 'upload'
  youtubeUrl?: string
  youtubeId?: string
  jobId?: string
  audioFormat?: 'm4a' | 'mp3'

  // Analysis results (THE VALUE)
  songData: any // SongData type from types.ts

  // Processing metadata
  processingTimeMs?: number
  promptVersion?: string

  // Quality flags (for seeds/debugging)
  isSeed?: boolean
  seedPath?: string
  qualityTier?: 'seed' | 'high' | 'medium' | 'low'
  notes?: string
  tags?: string[]
}

export interface AnalysisCacheParams {
  gcsObject: GCSObject
  targetLanguage: Language
  modelId: string
  karaokeMode: boolean
}

// --- Helper Functions ---

/**
 * Create normalized object key from GCS object.
 * Format: "{bucket}/{path}"
 */
export function makeObjectKey(gcsObject: GCSObject): string {
  return `${gcsObject.bucket}/${gcsObject.path}`
}

/**
 * Normalize model ID for cache key.
 * Strips prefixes and special characters.
 */
export function normalizeModelId(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/^models?\//, '') // Remove "models/" or "model/" prefix
    .replace(/[^a-z0-9]/g, '_') // Replace special chars with underscore
}

/**
 * Generate cache key for analysis.
 * Format: analysis:gcs:{sha1(objectKey)}:{lang}:{model}:{karaoke}
 */
export function makeAnalysisCacheKey(params: AnalysisCacheParams): string {
  const { gcsObject, targetLanguage, modelId, karaokeMode } = params

  const objectKey = makeObjectKey(gcsObject)
  const objectHash = crypto.createHash('sha1').update(objectKey).digest('hex')
  const langKey = targetLanguage.toLowerCase()
  const modelKey = normalizeModelId(modelId)
  const karaokeKey = karaokeMode ? '1' : '0'

  return `analysis:gcs:${objectHash}:${langKey}:${modelKey}:${karaokeKey}`
}

/**
 * Extract YouTube video ID from URL.
 */
export function extractYouTubeId(url: string): string | undefined {
  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
      /youtube\.com\/embed\/([^&\s]+)/,
      /youtube\.com\/v\/([^&\s]+)/
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match?.[1]) return match[1]
    }
    return undefined
  } catch {
    return undefined
  }
}

// --- Cache Operations ---

/**
 * Get cached analysis if it exists.
 * Returns null if not found or on error.
 */
export async function getCachedAnalysis(
  params: AnalysisCacheParams
): Promise<AnalysisCacheRecord | null> {
  try {
    const cacheKey = makeAnalysisCacheKey(params)
    const raw = await redisGet(cacheKey)

    if (!raw) {
      try {
        console.log('[analysisCache] cache miss', {
          key: cacheKey,
          objectKey: makeObjectKey(params.gcsObject),
          lang: params.targetLanguage,
          model: params.modelId,
          karaoke: params.karaokeMode
        })
      } catch {}
      return null
    }

    const record = JSON.parse(raw) as AnalysisCacheRecord

    // Validate cache version
    if (record.cacheVersion !== CACHE_VERSION) {
      try {
        console.warn('[analysisCache] version mismatch, ignoring cached value', {
          key: cacheKey,
          cached: record.cacheVersion,
          current: CACHE_VERSION
        })
      } catch {}
      return null
    }

    try {
      console.log('[analysisCache] cache hit', {
        key: cacheKey,
        objectKey: record.objectKey,
        cachedAt: new Date(record.cachedAt).toISOString(),
        isSeed: record.isSeed || false
      })
    } catch {}

    return record
  } catch (error) {
    try {
      console.error('[analysisCache] error reading cache', {
        error: error instanceof Error ? error.message : String(error),
        params
      })
    } catch {}
    return null
  }
}

/**
 * Store analysis in cache.
 */
export async function setCachedAnalysis(
  record: Omit<AnalysisCacheRecord, 'cacheKey' | 'cacheVersion' | 'cachedAt' | 'objectKey'>
): Promise<void> {
  try {
    const params: AnalysisCacheParams = {
      gcsObject: record.gcsObject,
      targetLanguage: record.targetLanguage,
      modelId: record.modelId,
      karaokeMode: record.karaokeMode
    }

    const cacheKey = makeAnalysisCacheKey(params)
    const objectKey = makeObjectKey(record.gcsObject)

    const fullRecord: AnalysisCacheRecord = {
      ...record,
      cacheKey,
      cacheVersion: CACHE_VERSION,
      cachedAt: Date.now(),
      objectKey
    }

    const ttl = record.isSeed ? SEED_CACHE_TTL : record.ttl || ANALYSIS_CACHE_TTL

    await redisSet(cacheKey, JSON.stringify(fullRecord), ttl > 0 ? ttl : undefined)

    try {
      console.log('[analysisCache] stored', {
        key: cacheKey,
        objectKey,
        ttl: ttl > 0 ? `${ttl}s` : 'no expiry',
        isSeed: record.isSeed || false
      })
    } catch {}
  } catch (error) {
    try {
      console.error('[analysisCache] error storing cache', {
        error: error instanceof Error ? error.message : String(error),
        gcsObject: record.gcsObject
      })
    } catch {}
    // Don't throw - caching is best-effort
  }
}

/**
 * Invalidate cached analysis.
 */
export async function invalidateCachedAnalysis(
  params: AnalysisCacheParams
): Promise<void> {
  try {
    const cacheKey = makeAnalysisCacheKey(params)
    // Note: Current redis.ts doesn't expose delete, but we can add it
    // For now, this is a placeholder
    try {
      console.log('[analysisCache] invalidation requested (not implemented)', {
        key: cacheKey
      })
    } catch {}
  } catch (error) {
    try {
      console.error('[analysisCache] error invalidating cache', {
        error: error instanceof Error ? error.message : String(error),
        params
      })
    } catch {}
  }
}
