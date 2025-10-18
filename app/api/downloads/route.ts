import '../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { newId, putJob, updateJob, getJob, getJobIdBySource, setJobIdForSource } from '../_lib/jobStore'
import { gaEvent } from '../_lib/ga'
import { getStorageProvider } from '../_lib/storage'

export const runtime = 'nodejs'

// TODO: once Apify callbacks are wired, switch completion logic to webhooks instead of polling.

type DownloadsRequestBody = {
  youtubeUrl: string
  audioFormat?: 'm4a' | 'mp3'
  country?: string
}

const parseRequestBody = (body: unknown): DownloadsRequestBody => {
  if (!body) throw new Error('Missing request body')
  const obj = typeof body === 'string' ? JSON.parse(body) : body
  if (typeof obj !== 'object' || obj == null) throw new Error('Invalid JSON body')
  const r = obj as Record<string, unknown>
  const youtubeUrl = typeof r.youtubeUrl === 'string' ? r.youtubeUrl : undefined
  const audioFormat = typeof r.audioFormat === 'string' ? (r.audioFormat as 'm4a' | 'mp3') : 'm4a'
  const envCountry = (process.env.APIFY_PROXY_COUNTRY || '').toUpperCase()
  const country = typeof r.country === 'string' && r.country
    ? String(r.country).toUpperCase()
    : (envCountry || 'IN')
  if (!youtubeUrl) throw new Error('youtubeUrl required')
  return { youtubeUrl, audioFormat, country }
}

export async function POST(req: NextRequest) {
  let rawBody: unknown = null
  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      rawBody = await req.json()
    } else {
      const text = await req.text()
      rawBody = text ? JSON.parse(text) : {}
    }
  } catch {
    rawBody = null
  }

  let payload: DownloadsRequestBody
  try {
    payload = parseRequestBody(rawBody)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Bad request'
    try { console.error('[downloads] bad body', msg) } catch {}
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const bucketName = process.env.GCS_BUCKET
  if (!bucketName) {
    return NextResponse.json({ error: 'GCS_BUCKET not set' }, { status: 500 })
  }

  const jobId = newId()
  const contentType = payload.audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/mp4'
  const objectPath = `downloads/${jobId}.${payload.audioFormat}`

  const storage = getStorageProvider()
  let uploadUrl: string
  let getUrl: string
  try {
    uploadUrl = await storage.getSignedWriteUrl(bucketName, objectPath, contentType)
    getUrl = await storage.getSignedReadUrl(bucketName, objectPath)
    try { console.log('[downloads] signed urls minted', { bucket: bucketName, objectPath, contentType }) } catch {}
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try { console.error('[downloads] sign url error', msg) } catch {}
    return NextResponse.json({ error: 'Failed to mint signed URLs', details: msg }, { status: 500 })
  }

  try {
    const existingId = await getJobIdBySource(payload.youtubeUrl)
    if (existingId) {
      const existing = await getJob(existingId)
      if (existing) {
        if (existing.status === 'failed') {
          try { console.warn('[downloads] cache hit but previous run failed — retrying with new job', { prevJobId: existingId }) } catch {}
        } else {
          if (existing.status === 'completed' && existing.gcsObject) {
            try {
              const freshGet = await storage.getSignedReadUrl(existing.gcsObject.bucket, existing.gcsObject.path)
              try { console.log('[downloads] cache hit (source→job)', { jobId: existingId, status: 'completed' }) } catch {}
              return NextResponse.json({ jobId: existingId, statusUrl: `/api/downloads/${existingId}`, getUrl: freshGet, apifyRunId: existing.apifyRunId })
            } catch {}
          }
          try { console.log('[downloads] cache hit (source→job)', { jobId: existingId, status: existing.status }) } catch {}
          return NextResponse.json({ jobId: existingId, statusUrl: `/api/downloads/${existingId}`, getUrl: existing.url, apifyRunId: existing.apifyRunId }, { status: 202 })
        }
      }
    }
  } catch {}

  const ACTOR = process.env.APIFY_ACTOR_ID
  const TOKEN = process.env.APIFY_TOKEN
  if (!ACTOR || !TOKEN) {
    return NextResponse.json({ error: 'APIFY_ACTOR_ID or APIFY_TOKEN not set' }, { status: 500 })
  }

  const startUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${encodeURIComponent(TOKEN)}`
  const actorInput = {
    youtubeUrl: payload.youtubeUrl,
    audioFormat: payload.audioFormat,
    formatExpr: 'bestaudio[ext=m4a]/140/234/bestaudio',
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: payload.country },
    uploadUrl,
    jobId,
  }

  await putJob({ id: jobId, status: 'queued', workerUrl: 'apify', gcsObject: { bucket: bucketName, path: objectPath, contentType }, url: getUrl, sourceUrl: payload.youtubeUrl, startedAtMs: Date.now(), metricsSent: false })
  await setJobIdForSource(payload.youtubeUrl, jobId)

  let runId: string | undefined
  try {
    try { console.log('[downloads] apify:start', { actor: ACTOR, country: actorInput.proxyConfiguration.apifyProxyCountry, format: actorInput.audioFormat }) } catch {}
    const resp = await fetch(startUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(actorInput) })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      try { console.error('[downloads] apify:start:failed', { status: resp.status, body: text?.slice?.(0, 300) }) } catch {}
      await updateJob(jobId, { status: 'failed', error: { message: `Apify start failed (${resp.status})` } })
      return NextResponse.json({ error: 'Apify start failed', status: resp.status, body: text }, { status: 502 })
    }
    const json = (await resp.json().catch(() => ({} as any))) as any
    const runData = json?.data
    runId = runData?.id
    try {
      console.log('[downloads] apify:start:ok', {
        jobId,
        runId,
        status: runData?.status,
        finishedAt: runData?.finishedAt,
      })
    } catch {}
    if (!runId) {
      await updateJob(jobId, { status: 'failed', error: { message: 'Apify did not return a run id' } })
      return NextResponse.json({ error: 'Apify did not return a run id', details: json }, { status: 502 })
    }
    await updateJob(jobId, { status: 'working', apifyRunId: runId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    try { console.error('[downloads] apify:start:error', msg) } catch {}
    await updateJob(jobId, { status: 'failed', error: { message: msg } })
    return NextResponse.json({ error: 'Failed to contact Apify', details: msg }, { status: 502 })
  }

  try { console.log('[downloads] queued', { jobId, runId, statusUrl: `/api/downloads/${jobId}` }) } catch {}
  return NextResponse.json({ jobId, statusUrl: `/api/downloads/${jobId}`, getUrl, apifyRunId: runId }, { status: 202 })
}
