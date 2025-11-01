import '../../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { getJob, updateJob } from '../../_lib/jobStore'
import { gaEvent } from '../../_lib/ga'
import { getStorageProvider } from '../../_lib/storage'
import { getApifyAccount } from '../../_lib/apifyAccounts'

export const runtime = 'nodejs'

async function inferCompletionFromGcs(jobId: string) {
  const bucketName = process.env.GCS_BUCKET
  if (!bucketName) return null
  try {
    const storage = getStorageProvider()
    const exts = ['m4a', 'mp3'] as const
    for (const ext of exts) {
      const path = `downloads/${jobId}.${ext}`
      const exists = await storage.exists(bucketName, path)
      if (exists) {
        const info = await storage.getObjectInfo(bucketName, path)
        const signed = await storage.getSignedReadUrl(bucketName, path)
        const next = await updateJob(jobId, {
          status: 'completed',
          url: signed,
          gcsObject: {
            bucket: bucketName,
            path,
            contentType: info.contentType,
            size: info.size,
          },
        })
        try { console.log('[downloads:id] inferred completion via GCS', { id: jobId, path }) } catch {}
        return next || { id: jobId, status: 'completed', url: signed, gcsObject: { bucket: bucketName, path } }
      }
    }
  } catch {}
  return null
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await context.params
  const jobId = resolvedParams?.id
  if (!jobId) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 })
  }

  const storage = getStorageProvider()
  let job = await getJob(jobId)
  try { console.log('[downloads:id] fetch', { id: jobId, found: Boolean(job) }) } catch {}

  if (!job) {
    job = await inferCompletionFromGcs(jobId)
    if (!job) {
      return NextResponse.json({ id: jobId, status: 'queued' })
    }
  }

  const signCurrentObject = async () => {
    if (!job?.gcsObject?.bucket || !job?.gcsObject?.path) return null
    try {
      const exists = await storage.exists(job.gcsObject.bucket, job.gcsObject.path)
      if (!exists) return null
      const info = await storage.getObjectInfo(job.gcsObject.bucket, job.gcsObject.path)
      return {
        url: info.signedUrl || '',
        contentType: info.contentType,
        size: info.size,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      try { console.warn('[downloads:id] signCurrentObject error', { id: jobId, msg }) } catch {}
      return null
    }
  }

  let latestApifyStatus: string | undefined
  let pollToken: string | undefined
  if (job.apifyAccountLabel) {
    const cfg = await getApifyAccount(job.apifyAccountLabel).catch(() => undefined)
    pollToken = cfg?.token
  }
  if (!pollToken) pollToken = process.env.APIFY_TOKEN || undefined

  if (job.apifyRunId && pollToken) {
    try {
      const runUrl = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(job.apifyRunId)}?token=${encodeURIComponent(pollToken)}`
      const resp = await fetch(runUrl)
      if (resp.ok) {
        const data = await resp.json().catch(() => ({} as any))
        const runData = data?.data
        const status = (runData?.status as string | undefined) || ''
        if (status) {
          latestApifyStatus = status.toUpperCase()
          job = (await updateJob(jobId, { apifyStatus: status })) ?? job
        }
        if (!job.apifyDatasetId && runData?.defaultDatasetId) {
          job = (await updateJob(jobId, {
            apifyDatasetId: runData.defaultDatasetId,
            apifyKeyValueStoreId: runData.defaultKeyValueStoreId,
          })) ?? job
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      try { console.warn('[downloads:id] apify status error', { id: jobId, msg }) } catch {}
    }
  }

  if (latestApifyStatus && ['FAILED', 'ABORTED', 'TIMED_OUT', 'TIMEDOUT'].includes(latestApifyStatus)) {
    const updated = await updateJob(jobId, {
      status: 'failed',
      error: { message: `Apify run ${latestApifyStatus.toLowerCase()}` },
    })
    if (updated) job = updated
  }

  if (job.status !== 'completed') {
    if (latestApifyStatus === 'SUCCEEDED' || latestApifyStatus === 'FINISHED') {
      const signed = await signCurrentObject()
      if (signed) {
        const updated = await updateJob(jobId, {
          status: 'completed',
          url: signed.url,
          gcsObject: {
            ...job.gcsObject,
            bucket: job.gcsObject?.bucket,
            path: job.gcsObject?.path,
            contentType: signed.contentType ?? job.gcsObject?.contentType,
            size: signed.size ?? job.gcsObject?.size,
          },
        })
        if (updated) job = updated
      }
    } else {
      const signed = await signCurrentObject()
      if (signed) {
        const updated = await updateJob(jobId, {
          status: 'completed',
          url: signed.url,
          gcsObject: {
            ...job.gcsObject,
            bucket: job.gcsObject?.bucket,
            path: job.gcsObject?.path,
            contentType: signed.contentType ?? job.gcsObject?.contentType,
            size: signed.size ?? job.gcsObject?.size,
          },
        })
        if (updated) job = updated
      }
    }
  } else if (job.gcsObject && (!job.url || job.url.startsWith('https://storage.googleapis.com'))) {
    const signed = await signCurrentObject()
    if (signed) {
      job = (await updateJob(jobId, {
        url: signed.url,
        gcsObject: {
          ...job.gcsObject,
          contentType: signed.contentType ?? job.gcsObject.contentType,
          size: signed.size ?? job.gcsObject.size,
        },
      })) ?? job
    }
  }

  if (!job.metricsSent && job.status === 'completed') {
    gaEvent('download_complete_server', { job_id: jobId, origin: 'server' }).catch(() => {})
    await updateJob(jobId, { metricsSent: true })
  }

  return NextResponse.json(job)
}
