#!/usr/bin/env tsx
/**
 * List all jobs in Redis
 *
 * Usage: npm run list-jobs
 */

import '../app/api/_lib/loadEnv'
import { getRedis } from '../app/api/_lib/redis'

async function listJobs() {
  console.log('\n🔍 Searching Redis for download jobs...\n')

  const redis = await getRedis()
  if (!redis) {
    console.error('❌ Redis not available')
    process.exit(1)
  }

  try {
    // Scan for all keys matching downloads:*
    const keys = await redis.keys('downloads:*')

    if (keys.length === 0) {
      console.log('📭 No jobs found in Redis')
      return
    }

    console.log(`📦 Found ${keys.length} key(s) in Redis:\n`)

    for (const key of keys) {
      if (key.startsWith('downloads:src:')) {
        // This is a source URL → job ID mapping
        const jobId = await redis.get(key)
        console.log(`  🔗 ${key}`)
        console.log(`     → Job ID: ${jobId}`)
      } else if (key.startsWith('downloads:')) {
        // This is a job record
        const jobId = key.replace('downloads:', '')
        const raw = await redis.get(key)

        if (!raw) {
          console.log(`  ⚠️  ${key} - empty`)
          continue
        }

        try {
          const job = JSON.parse(raw)
          console.log(`  📄 Job: ${jobId}`)
          console.log(`     Status: ${job.status}`)
          console.log(`     Worker: ${job.workerUrl || 'unknown'}`)
          console.log(`     GCS: ${job.gcsObject?.bucket}/${job.gcsObject?.path}`)
          if (job.apifyRunId) {
            console.log(`     Apify Run: ${job.apifyRunId}`)
            console.log(`     View at: https://console.apify.com/actors/runs/${job.apifyRunId}`)
          }
          if (job.sourceUrl) {
            console.log(`     Source: ${job.sourceUrl}`)
          }
        } catch (err) {
          console.log(`  ⚠️  ${key} - failed to parse: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      console.log()
    }
  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : String(err))
    await redis.quit()
    process.exit(1)
  } finally {
    await redis.quit()
  }
}

listJobs()
