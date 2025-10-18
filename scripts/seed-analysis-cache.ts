#!/usr/bin/env tsx

/**
 * Seed Analysis Cache Script
 *
 * Populates Redis cache with pre-analyzed seed songs for quick startup.
 *
 * Usage:
 *   npm run seed-cache
 *   # or with custom seed file:
 *   tsx scripts/seed-analysis-cache.ts path/to/seeds.json
 *
 * Seed file format:
 * [
 *   {
 *     "gcsObject": { "bucket": "my-bucket", "path": "seeds/hindi/song1.m4a" },
 *     "targetLanguage": "Hindi",
 *     "modelId": "gemini-2.0-flash-exp",
 *     "karaokeMode": true,
 *     "songData": { ... },
 *     "youtubeUrl": "https://youtube.com/watch?v=...",
 *     "notes": "Popular Hindi song for testing"
 *   }
 * ]
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import { setCachedAnalysis, type AnalysisCacheRecord, type GCSObject } from '../app/api/_lib/analysisCache'
import type { Language } from '../types'

interface SeedEntry {
  gcsObject: GCSObject
  targetLanguage: Language
  modelId: string
  karaokeMode: boolean
  songData: any
  youtubeUrl?: string
  youtubeId?: string
  notes?: string
  tags?: string[]
  qualityTier?: 'seed' | 'high' | 'medium' | 'low'
}

async function loadSeedFile(seedPath: string): Promise<SeedEntry[]> {
  try {
    const raw = await fs.readFile(seedPath, 'utf-8')
    const seeds = JSON.parse(raw) as SeedEntry[]

    if (!Array.isArray(seeds)) {
      throw new Error('Seed file must contain an array of seed entries')
    }

    return seeds
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load seed file: ${message}`)
  }
}

async function seedCache(seeds: SeedEntry[]): Promise<void> {
  console.log(`[seed-cache] Starting to seed ${seeds.length} entries...`)

  let successCount = 0
  let failCount = 0

  for (const [index, seed] of seeds.entries()) {
    try {
      const { gcsObject, targetLanguage, modelId, karaokeMode, songData, youtubeUrl, youtubeId, notes, tags, qualityTier } = seed

      // Validate required fields
      if (!gcsObject?.bucket || !gcsObject?.path) {
        throw new Error('Missing required field: gcsObject.bucket or gcsObject.path')
      }
      if (!targetLanguage) {
        throw new Error('Missing required field: targetLanguage')
      }
      if (!modelId) {
        throw new Error('Missing required field: modelId')
      }
      if (karaokeMode == null) {
        throw new Error('Missing required field: karaokeMode')
      }
      if (!songData) {
        throw new Error('Missing required field: songData')
      }

      const seedPath = gcsObject.path
      const sourceType = youtubeUrl ? 'youtube' : 'upload'

      await setCachedAnalysis({
        gcsObject,
        targetLanguage,
        modelId,
        karaokeMode,
        sourceType,
        youtubeUrl,
        youtubeId,
        songData,
        ttl: 0, // No expiry for seeds
        isSeed: true,
        seedPath,
        qualityTier: qualityTier || 'seed',
        notes,
        tags,
      })

      console.log(`[seed-cache] ✓ [${index + 1}/${seeds.length}] Cached: ${songData.title || 'Untitled'} (${targetLanguage})`)
      successCount++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[seed-cache] ✗ [${index + 1}/${seeds.length}] Failed to cache seed:`, message)
      console.error(`[seed-cache]   Seed data:`, JSON.stringify(seed, null, 2).slice(0, 300))
      failCount++
    }
  }

  console.log(`\n[seed-cache] Complete: ${successCount} succeeded, ${failCount} failed`)

  if (failCount > 0) {
    process.exit(1)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const seedPath = args[0] || path.join(__dirname, '../data/seed-songs.json')

  console.log(`[seed-cache] Loading seeds from: ${seedPath}`)

  try {
    const seeds = await loadSeedFile(seedPath)
    await seedCache(seeds)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[seed-cache] Fatal error:`, message)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main()
}

export { loadSeedFile, seedCache }
