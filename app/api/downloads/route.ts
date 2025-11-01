import '../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { newId, putJob, updateJob, getJob, getJobIdBySource, setJobIdForSource } from '../_lib/jobStore'
import { gaEvent } from '../_lib/ga'
import { getStorageProvider } from '../_lib/storage'
import { loadApifyAccounts, ApifyAccountConfig } from '../_lib/apifyAccounts'

export const runtime = 'nodejs'

const DEFAULT_MAX_DURATION_SECONDS = 600
const DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024

const parsedMaxDuration = Number(process.env.APIFY_MAX_DURATION_SECONDS)
const APIFY_MAX_DURATION_SECONDS = Number.isFinite(parsedMaxDuration) && parsedMaxDuration > 0
  ? parsedMaxDuration
  : DEFAULT_MAX_DURATION_SECONDS
const parsedMaxBytes = Number(process.env.APIFY_MAX_FILE_SIZE_BYTES || process.env.APIFY_MAX_FILESIZE_BYTES)
const APIFY_MAX_FILE_SIZE_BYTES = Number.isFinite(parsedMaxBytes) && parsedMaxBytes > 0
  ? parsedMaxBytes
  : DEFAULT_MAX_FILE_SIZE_BYTES

// TODO: once Apify callbacks are wired, switch completion logic to webhooks instead of polling.

type DownloadsRequestBody = {
  youtubeUrl: string
  audioFormat?: 'm4a' | 'mp3'
  country?: string
  maxDurationSeconds?: number
  maxFileSizeBytes?: number
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
  const maxDurationSecondsRaw = (r.maxDurationSeconds as number | string | undefined)
  const maxDurationSeconds = Number(maxDurationSecondsRaw)
  const hasMaxDuration = Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0
  const maxFileSizeBytesRaw = (r.maxFileSizeBytes as number | string | undefined)
  const maxFileSizeBytes = Number(maxFileSizeBytesRaw)
  const hasMaxFileSize = Number.isFinite(maxFileSizeBytes) && maxFileSizeBytes > 0
  if (!youtubeUrl) throw new Error('youtubeUrl required')
  return {
    youtubeUrl,
    audioFormat,
    country,
    maxDurationSeconds: hasMaxDuration ? maxDurationSeconds : undefined,
    maxFileSizeBytes: hasMaxFileSize ? maxFileSizeBytes : undefined,
  }
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
              return NextResponse.json({
                jobId: existingId,
                statusUrl: `/api/downloads/${existingId}`,
                getUrl: freshGet,
                apifyRunId: existing.apifyRunId,
                apifyAccountLabel: existing.apifyAccountLabel,
              })
            } catch {}
          }
          try { console.log('[downloads] cache hit (source→job)', { jobId: existingId, status: existing.status }) } catch {}
          return NextResponse.json({
            jobId: existingId,
            statusUrl: `/api/downloads/${existingId}`,
            getUrl: existing.url,
            apifyRunId: existing.apifyRunId,
            apifyAccountLabel: existing.apifyAccountLabel,
          }, { status: 202 })
        }
      }
    }
  } catch {}

  await putJob({ id: jobId, status: 'queued', workerUrl: 'apify', gcsObject: { bucket: bucketName, path: objectPath, contentType }, url: getUrl, sourceUrl: payload.youtubeUrl, startedAtMs: Date.now(), metricsSent: false })
  await setJobIdForSource(payload.youtubeUrl, jobId)

  let runId: string | undefined
  let selectedAccount: ApifyAccountConfig | undefined
  let defaultDatasetId: string | undefined
  let defaultKeyValueStoreId: string | undefined
  let lastErrorSummary: string | undefined

  const accounts = await loadApifyAccounts()
  if (!accounts.length) {
    await updateJob(jobId, { status: 'failed', error: { message: 'No Apify accounts configured' } })
    return NextResponse.json({ error: 'No Apify accounts configured' }, { status: 500 })
  }

  const attempts: { label: string; status?: number; error?: string }[] = []

  try {
    for (const account of accounts) {
      const targetId = account.taskId || account.actorId || process.env.APIFY_ACTOR_ID
      const mode = account.taskId ? 'task' : 'actor'
      if (!targetId) {
        attempts.push({ label: account.label, error: 'Missing actor/task id' })
        continue
      }

      const token = account.token
      const startUrl = mode === 'task'
        ? `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(targetId)}/runs?token=${encodeURIComponent(token)}`
        : `https://api.apify.com/v2/acts/${encodeURIComponent(targetId)}/runs?token=${encodeURIComponent(token)}`

      const proxyDefaults: Record<string, any> = account.proxyConfiguration
        ? { ...account.proxyConfiguration }
        : { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] }
      if (proxyDefaults) {
        proxyDefaults.apifyProxyCountry = payload.country
      }

      const actorInput: Record<string, any> = { ...(account.inputDefaults || {}) }
      actorInput.youtubeUrl = payload.youtubeUrl
      actorInput.audioFormat = payload.audioFormat
      actorInput.formatExpr = actorInput.formatExpr || 'bestaudio[ext=m4a]/140/234/bestaudio'
      actorInput.proxyConfiguration = proxyDefaults
      actorInput.uploadUrl = uploadUrl
      actorInput.jobId = jobId
      // Limits from API request take precedence when provided
      if (typeof payload.maxDurationSeconds === 'number') {
        actorInput.maxDurationSeconds = payload.maxDurationSeconds
      }
      if (typeof payload.maxFileSizeBytes === 'number') {
        actorInput.maxFileSizeBytes = payload.maxFileSizeBytes
      }
      if (APIFY_MAX_DURATION_SECONDS && actorInput.maxDurationSeconds == null) {
        actorInput.maxDurationSeconds = APIFY_MAX_DURATION_SECONDS
      }
      if (APIFY_MAX_FILE_SIZE_BYTES && actorInput.maxFileSizeBytes == null) {
        actorInput.maxFileSizeBytes = APIFY_MAX_FILE_SIZE_BYTES
      }

      try { console.log('[downloads] apify:start', { account: account.label, mode, targetId, country: payload.country }) } catch {}
      const resp = await fetch(startUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(actorInput) })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        attempts.push({ label: account.label, status: resp.status, error: text?.slice?.(0, 200) })
        try { console.error('[downloads] apify:start:failed', { account: account.label, status: resp.status, body: text?.slice?.(0, 300) }) } catch {}
        continue
      }

      const json = (await resp.json().catch(() => ({} as any))) as any
      const runData = json?.data
      runId = runData?.id
      defaultDatasetId = runData?.defaultDatasetId
      defaultKeyValueStoreId = runData?.defaultKeyValueStoreId
      try {
        console.log('[downloads] apify:start:ok', {
          jobId,
          runId,
          account: account.label,
          status: runData?.status,
          finishedAt: runData?.finishedAt,
        })
      } catch {}
      if (!runId) {
        attempts.push({ label: account.label, error: 'Missing run id in response' })
        continue
      }
      selectedAccount = account
      break
    }

    if (!selectedAccount || !runId) {
      lastErrorSummary = attempts.map((a) => `${a.label}${a.status ? ` (${a.status})` : ''}${a.error ? `: ${a.error}` : ''}`).join('; ') || 'Unknown Apify error'
      try {
        console.warn('[downloads] apify:start:exhausted', { jobId, attempts })
      } catch {}
      // TODO(babelback-12): add unit coverage for multi-account fallbacks once runner extraction lands.
      await updateJob(jobId, { status: 'failed', error: { message: `Apify start failed: ${lastErrorSummary.slice(0, 180)}` } })
      return NextResponse.json({ error: 'Apify start failed', details: attempts }, { status: 502 })
    }

    await updateJob(jobId, {
      status: 'working',
      apifyRunId: runId,
      apifyAccountLabel: selectedAccount.label,
      apifyDatasetId: defaultDatasetId,
      apifyKeyValueStoreId: defaultKeyValueStoreId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    try { console.error('[downloads] apify:start:error', msg) } catch {}
    await updateJob(jobId, { status: 'failed', error: { message: msg } })
    return NextResponse.json({ error: 'Failed to contact Apify', details: msg }, { status: 502 })
  }

  try { console.log('[downloads] queued', { jobId, runId, statusUrl: `/api/downloads/${jobId}` }) } catch {}
  return NextResponse.json({
    jobId,
    statusUrl: `/api/downloads/${jobId}`,
    getUrl,
    apifyRunId: runId,
    apifyAccountLabel: selectedAccount?.label,
  }, { status: 202 })
}
