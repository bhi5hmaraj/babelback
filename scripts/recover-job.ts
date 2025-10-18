#!/usr/bin/env tsx
/**
 * Job Recovery Script
 *
 * Attempts to recover a lost job from GCS and add it back to Redis
 * Usage: npm run recover-job <job-id>
 */

import '../app/api/_lib/loadEnv'
import { putJob, getJob } from '../app/api/_lib/jobStore'
import { getStorageProvider } from '../app/api/_lib/storage'

async function recoverJob(jobId: string) {
  console.log(`\n🔍 Attempting to recover job: ${jobId}`)

  // Check if job already exists
  const existing = await getJob(jobId)
  if (existing) {
    console.log(`✓ Job found in store:`)
    console.log(`  Status: ${existing.status}`)
    console.log(`  Worker: ${existing.workerUrl}`)
    console.log(`  GCS: ${existing.gcsObject?.bucket}/${existing.gcsObject?.path}`)
    console.log(`\n✅ Job is already available, no recovery needed`)
    return
  }

  console.log(`⚠️  Job not found in store, checking GCS...`)

  const bucketName = process.env.GCS_BUCKET
  if (!bucketName) {
    console.error(`❌ GCS_BUCKET not configured`)
    process.exit(1)
  }

  const storage = makeStorage()
  const exts = ['m4a', 'mp3'] as const

  for (const ext of exts) {
    const path = `downloads/${jobId}.${ext}`
    console.log(`  Checking: ${bucketName}/${path}`)

    try {
      const file = storage.bucket(bucketName).file(path)
      const [exists] = await file.exists()

      if (exists) {
        console.log(`  ✓ Found file in GCS!`)

        // Get metadata
        const [metadata] = await file.getMetadata().catch(() => [{} as any])
        console.log(`    Size: ${metadata.size ? (Number(metadata.size) / 1024 / 1024).toFixed(2) + ' MB' : 'unknown'}`)
        console.log(`    Content-Type: ${metadata.contentType || 'unknown'}`)
        console.log(`    Created: ${metadata.timeCreated || 'unknown'}`)

        // Generate signed URL
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
        })

        // Reconstruct job
        const recoveredJob = {
          id: jobId,
          status: 'completed' as const,
          url: signedUrl,
          gcsObject: {
            bucket: bucketName,
            path,
            contentType: metadata.contentType,
            size: metadata.size ? Number(metadata.size) : undefined,
          },
          workerUrl: 'apify',
        }

        // Save to store
        await putJob(recoveredJob)

        console.log(`\n✅ Job recovered and saved to store!`)
        console.log(`   You can now use: npm run seed -- add ${jobId}`)

        return
      }
    } catch (err) {
      console.log(`  ✗ Error checking file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`\n❌ Job not found in GCS`)
  console.log(`   The job may have failed or the files were deleted`)
  console.log(`   Checked paths:`)
  exts.forEach(ext => console.log(`   - ${bucketName}/downloads/${jobId}.${ext}`))
}

async function main() {
  const jobId = process.argv[2]

  if (!jobId) {
    console.error('Usage: npm run recover-job <job-id>')
    process.exit(1)
  }

  try {
    await recoverJob(jobId)
  } catch (err) {
    console.error(`\n❌ Error: ${err instanceof Error ? err.message : String(err)}`)
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

main()
