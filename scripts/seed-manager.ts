#!/usr/bin/env tsx

/**
 * Seed Manager - Control Plane for Seed Data
 *
 * Usage:
 *   npm run seed -- list                           # List all seeds
 *   npm run seed -- add <jobId>                    # Add seed from analyzed job
 *   npm run seed -- add-redis <cacheKey>           # Add seed from Redis cache
 *   npm run seed -- remove <seedId>                # Remove seed from manifest
 *   npm run seed -- sync                           # Sync all seeds to Redis
 *   npm run seed -- clear                          # Clear all seeds from Redis
 *   npm run seed -- export <jobId> [output.json]   # Export job to seed JSON
 */

import '../app/api/_lib/loadEnv' // Load environment variables first!
import fs from 'node:fs/promises'
import path from 'node:path'
import { getJob } from '../app/api/_lib/jobStore'
import { getCachedAnalysis, setCachedAnalysis, makeAnalysisCacheKey, extractYouTubeId, type AnalysisCacheRecord, type GCSObject } from '../app/api/_lib/analysisCache'
import type { Language } from '../types'

const SEED_FILE = path.join(process.cwd(), 'data/seed-songs.json')

interface SeedManifestEntry {
  id: string
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
  addedAt: number
}

// --- File Operations ---

async function loadSeeds(): Promise<SeedManifestEntry[]> {
  try {
    const raw = await fs.readFile(SEED_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch (error: any) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function saveSeeds(seeds: SeedManifestEntry[]): Promise<void> {
  const dir = path.dirname(SEED_FILE)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(SEED_FILE, JSON.stringify(seeds, null, 2), 'utf-8')
}

function generateSeedId(gcsObject: GCSObject, targetLanguage: string): string {
  const pathPart = gcsObject.path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown'
  const langPart = targetLanguage.toLowerCase().slice(0, 2)
  const timestamp = Date.now().toString(36)
  return `${langPart}-${pathPart}-${timestamp}`
}

// --- Commands ---

async function listSeeds() {
  const seeds = await loadSeeds()

  if (seeds.length === 0) {
    console.log('📭 No seeds found')
    return
  }

  console.log(`\n📚 Found ${seeds.length} seed(s):\n`)

  seeds.forEach((seed, idx) => {
    console.log(`${idx + 1}. [${seed.id}]`)
    console.log(`   Title: ${seed.songData.title || 'Untitled'}`)
    console.log(`   Language: ${seed.targetLanguage} (${seed.songData.originalLanguage})`)
    console.log(`   GCS: ${seed.gcsObject.bucket}/${seed.gcsObject.path}`)
    console.log(`   Model: ${seed.modelId} | Karaoke: ${seed.karaokeMode ? 'Yes' : 'No'}`)
    console.log(`   Verses: ${seed.songData.verses?.length || 0}`)
    if (seed.youtubeUrl) console.log(`   YouTube: ${seed.youtubeUrl}`)
    if (seed.notes) console.log(`   Notes: ${seed.notes}`)
    if (seed.tags?.length) console.log(`   Tags: ${seed.tags.join(', ')}`)
    console.log(`   Added: ${new Date(seed.addedAt).toISOString()}`)
    console.log()
  })
}

async function addSeedFromJob(jobId: string) {
  console.log(`\n🔍 Fetching job: ${jobId}`)

  const job = await getJob(jobId)
  if (!job) {
    console.error(`❌ Job not found: ${jobId}`)
    process.exit(1)
  }

  if (!job.gcsObject) {
    console.error(`❌ Job has no GCS object`)
    process.exit(1)
  }

  console.log(`✓ Found GCS object: ${job.gcsObject.bucket}/${job.gcsObject.path}`)

  // Prompt for language and karaoke mode
  console.log(`\n📝 Enter details for seed:`)
  const targetLanguage = await prompt('Target language (Hindi/English/Tamil/Telugu/Bengali): ', 'Hindi')
  const karaokeMode = await promptYesNo('Karaoke mode? (y/n): ', true)
  const modelId = await prompt('Model ID: ', 'gemini-2.0-flash-exp')

  // Check if analysis exists in cache
  const cached = await getCachedAnalysis({
    gcsObject: job.gcsObject,
    targetLanguage: targetLanguage as Language,
    modelId,
    karaokeMode,
  })

  if (!cached) {
    console.error(`\n❌ No cached analysis found for these parameters.`)
    console.error(`   Requested:`)
    console.error(`   - Language: ${targetLanguage}`)
    console.error(`   - Karaoke: ${karaokeMode}`)
    console.error(`   - Model: ${modelId}`)

    // Try to find what analyses ARE available for this GCS object
    console.error(`\n🔍 Searching for available analyses for this audio file...`)
    try {
      const redis = await import('../app/api/_lib/redis').then(m => m.getRedis())
      if (redis) {
        const objectKey = `${job.gcsObject.bucket}/${job.gcsObject.path}`
        const crypto = await import('node:crypto')
        const objectHash = crypto.default.createHash('sha1').update(objectKey).digest('hex')
        const pattern = `analysis:gcs:${objectHash}:*`
        const keys = await redis.keys(pattern)

        if (keys.length > 0) {
          console.error(`\n✓ Found ${keys.length} cached analysis/analyses:`)
          for (const key of keys) {
            const parts = key.split(':')
            const lang = parts[3]
            const model = parts[4]
            const karaoke = parts[5] === '1' ? 'true' : 'false'
            console.error(`   - Language: ${lang}, Model: ${model}, Karaoke: ${karaoke}`)
          }
          console.error(`\n💡 Try using one of these parameter combinations instead.`)
        } else {
          console.error(`\n✗ No analyses found in cache for this audio file.`)
          console.error(`   Please analyze this song first in the app.`)
        }
      }
    } catch (err) {
      // Ignore errors in search
    }

    process.exit(1)
  }

  console.log(`✓ Found cached analysis: "${cached.songData.title}"`)

  const notes = await prompt('\nNotes (optional): ', '')
  const tags = await prompt('Tags (comma-separated, optional): ', '')

  const seedId = generateSeedId(job.gcsObject, targetLanguage)

  const newSeed: SeedManifestEntry = {
    id: seedId,
    gcsObject: job.gcsObject,
    targetLanguage: targetLanguage as Language,
    modelId,
    karaokeMode,
    songData: cached.songData,
    youtubeUrl: cached.youtubeUrl,
    youtubeId: cached.youtubeId,
    notes: notes || undefined,
    tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    qualityTier: 'seed',
    addedAt: Date.now(),
  }

  const seeds = await loadSeeds()
  seeds.push(newSeed)
  await saveSeeds(seeds)

  console.log(`\n✅ Added seed: ${seedId}`)
  console.log(`   Title: ${newSeed.songData.title}`)
  console.log(`   Path: data/seed-songs.json`)

  console.log(`\n💡 Next steps:`)
  console.log(`   npm run seed -- sync    # Push to Redis`)
}

async function removeSeed(seedId: string) {
  const seeds = await loadSeeds()
  const index = seeds.findIndex(s => s.id === seedId)

  if (index === -1) {
    console.error(`❌ Seed not found: ${seedId}`)
    process.exit(1)
  }

  const seed = seeds[index]
  console.log(`\n🗑️  Removing seed: ${seed.songData.title}`)

  const confirm = await promptYesNo('Are you sure? (y/n): ', false)
  if (!confirm) {
    console.log('Cancelled')
    return
  }

  seeds.splice(index, 1)
  await saveSeeds(seeds)

  console.log(`✅ Removed seed: ${seedId}`)
  console.log(`   Run "npm run seed -- sync" to update Redis`)
}

async function syncSeeds() {
  const seeds = await loadSeeds()

  if (seeds.length === 0) {
    console.log('📭 No seeds to sync')
    return
  }

  console.log(`\n🔄 Syncing ${seeds.length} seed(s) to Redis...\n`)

  let successCount = 0
  let failCount = 0

  for (const seed of seeds) {
    try {
      await setCachedAnalysis({
        gcsObject: seed.gcsObject,
        targetLanguage: seed.targetLanguage,
        modelId: seed.modelId,
        karaokeMode: seed.karaokeMode,
        sourceType: seed.youtubeUrl ? 'youtube' : 'upload',
        youtubeUrl: seed.youtubeUrl,
        youtubeId: seed.youtubeId,
        songData: seed.songData,
        ttl: 0, // No expiry
        isSeed: true,
        seedPath: seed.gcsObject.path,
        qualityTier: seed.qualityTier || 'seed',
        notes: seed.notes,
        tags: seed.tags,
      })

      console.log(`✓ ${seed.songData.title || seed.id}`)
      successCount++
    } catch (error) {
      console.error(`✗ ${seed.id}: ${error instanceof Error ? error.message : String(error)}`)
      failCount++
    }
  }

  console.log(`\n✅ Sync complete: ${successCount} succeeded, ${failCount} failed`)
}

async function clearSeeds() {
  console.log(`\n⚠️  This will clear all seed cache entries from Redis`)
  console.log(`   (The seed manifest file will NOT be deleted)`)

  const confirm = await promptYesNo('\nContinue? (y/n): ', false)
  if (!confirm) {
    console.log('Cancelled')
    return
  }

  console.log(`\n🧹 Clearing Redis cache...`)
  console.log(`⚠️  Note: Redis delete is not implemented in redis.ts yet`)
  console.log(`   You can manually clear with: redis-cli KEYS "analysis:gcs:*" | xargs redis-cli DEL`)

  // TODO: Implement delete in redis.ts and call here
}

async function exportJobToSeed(jobId: string, outputFile?: string) {
  console.log(`\n🔍 Fetching job: ${jobId}`)

  const job = await getJob(jobId)
  if (!job || !job.gcsObject) {
    console.error(`❌ Job not found or has no GCS object: ${jobId}`)
    process.exit(1)
  }

  const targetLanguage = await prompt('Target language: ', 'Hindi')
  const karaokeMode = await promptYesNo('Karaoke mode? (y/n): ', true)
  const modelId = await prompt('Model ID: ', 'gemini-2.0-flash-exp')

  const cached = await getCachedAnalysis({
    gcsObject: job.gcsObject,
    targetLanguage: targetLanguage as Language,
    modelId,
    karaokeMode,
  })

  if (!cached) {
    console.error(`❌ No cached analysis found`)
    process.exit(1)
  }

  const seedEntry = {
    gcsObject: job.gcsObject,
    targetLanguage,
    modelId,
    karaokeMode,
    songData: cached.songData,
    youtubeUrl: cached.youtubeUrl,
    youtubeId: cached.youtubeId,
    notes: '',
    tags: [],
    qualityTier: 'seed',
  }

  const output = outputFile || `seed-${jobId}.json`
  await fs.writeFile(output, JSON.stringify([seedEntry], null, 2), 'utf-8')

  console.log(`\n✅ Exported to: ${output}`)
  console.log(`   You can review and add to data/seed-songs.json`)
}

// --- Helpers ---

async function prompt(question: string, defaultValue: string = ''): Promise<string> {
  process.stdout.write(question)

  return new Promise((resolve) => {
    const stdin = process.stdin
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let input = ''

    const onData = (key: string) => {
      if (key === '\u0003') { // Ctrl+C
        process.exit(0)
      }

      if (key === '\r' || key === '\n') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        console.log()
        resolve(input || defaultValue)
        return
      }

      if (key === '\u007F') { // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1)
          process.stdout.write('\b \b')
        }
        return
      }

      if (key >= ' ' && key <= '~') {
        input += key
        process.stdout.write(key)
      }
    }

    stdin.on('data', onData)
  })
}

async function promptYesNo(question: string, defaultValue: boolean): Promise<boolean> {
  const answer = await prompt(question, defaultValue ? 'y' : 'n')
  return answer.toLowerCase().startsWith('y')
}

// --- Main ---

async function main() {
  const [command, ...args] = process.argv.slice(2)

  console.log('🌱 Seed Manager\n')

  try {
    switch (command) {
      case 'list':
        await listSeeds()
        break

      case 'add':
        if (!args[0]) {
          console.error('Usage: npm run seed -- add <jobId>')
          process.exit(1)
        }
        await addSeedFromJob(args[0])
        break

      case 'remove':
        if (!args[0]) {
          console.error('Usage: npm run seed -- remove <seedId>')
          process.exit(1)
        }
        await removeSeed(args[0])
        break

      case 'sync':
        await syncSeeds()
        break

      case 'clear':
        await clearSeeds()
        break

      case 'export':
        if (!args[0]) {
          console.error('Usage: npm run seed -- export <jobId> [output.json]')
          process.exit(1)
        }
        await exportJobToSeed(args[0], args[1])
        break

      default:
        console.log('Usage:')
        console.log('  npm run seed -- list              List all seeds')
        console.log('  npm run seed -- add <jobId>       Add seed from job')
        console.log('  npm run seed -- remove <seedId>   Remove seed')
        console.log('  npm run seed -- sync              Sync to Redis')
        console.log('  npm run seed -- clear             Clear Redis cache')
        console.log('  npm run seed -- export <jobId>    Export to JSON')
        console.log()
        process.exit(1)
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`)
    await closeRedis()
    process.exit(1)
  }

  // Close Redis connection before exit
  await closeRedis()
}

async function closeRedis() {
  try {
    const { getRedis } = await import('../app/api/_lib/redis')
    const redis = await getRedis()
    if (redis) {
      await redis.quit()
    }
  } catch {
    // Ignore errors during cleanup
  }
}

if (require.main === module) {
  main()
}
