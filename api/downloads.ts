/**
 * Downloads API
 *
 * POST /api/downloads
 * - Mints GCS V4 signed URLs (PUT for upload, GET for reading)
 * - Starts an Apify actor run (yt-dlp) to fetch audio from YouTube
 * - Persists a job record and maps source URL → jobId for fast-path reuse
 *
 * Notes
 * - Country default can be overridden via body.country or APIFY_PROXY_COUNTRY env
 * - Uses Redis/Vercel KV when available; falls back to in-memory cache
 */
import './_lib/loadEnv.js'
import { Storage } from '@google-cloud/storage'
import { newId, putJob } from './_lib/jobStore.js'
import { updateJob } from './_lib/jobStore.js'
import { getJob, getJobIdBySource, setJobIdForSource } from './_lib/jobStore.js'

interface VercelRequest { method?: string; body?: unknown }
interface VercelResponse { status: (code: number) => VercelResponse; json: (b: unknown) => void; setHeader?: (k: string, v: string) => void }

/**
 * Body accepted by POST /api/downloads
 */
type DownloadsRequestBody = {
  youtubeUrl: string
  audioFormat?: 'm4a' | 'mp3'
  country?: string
}

/**
 * Validate and coerce user payload.
 */
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

/**
 * Route handler for creating a download job.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method ?? 'GET').toUpperCase()
  try { console.log('[downloads] start', { method }) } catch {}
  if (method !== 'POST') {
    if (res.setHeader) res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  let payload: DownloadsRequestBody
  try {
    payload = parseRequestBody(req.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bad request'
    try { console.error('[downloads] bad body', msg) } catch {}
    res.status(400).json({ error: msg })
    return
  }

  const jobId = newId()
  const bucketName = process.env.GCS_BUCKET
  if (!bucketName) {
    res.status(500).json({ error: 'GCS_BUCKET not set' })
    return
  }
  const contentType = payload.audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/mp4'
  const objectPath = `downloads/${jobId}.${payload.audioFormat}`

  // Mint V4 signed PUT + short-lived GET using env credentials (Vercel-friendly)
  let storage: Storage
  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (keyJson) {
    try {
      const sa = JSON.parse(keyJson)
      storage = new Storage({
        projectId: sa.project_id,
        credentials: {
          client_email: sa.client_email,
          private_key: String(sa.private_key || '').replace(/\\n/g, '\n'),
        },
      })
    } catch {
      res.status(500).json({ error: 'Invalid GCP_SERVICE_ACCOUNT_KEY JSON' })
      return
    }
  } else if (process.env.GCP_PROJECT_ID && process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: String(process.env.GCP_PRIVATE_KEY).replace(/\\n/g, '\n'),
      },
    })
  } else {
    storage = new Storage()
  }

  let uploadUrl: string, getUrl: string
  try {
    const file = storage.bucket(bucketName).file(objectPath)
    ;[uploadUrl] = await file.getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + 30 * 60 * 1000, contentType })
    ;[getUrl] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 2 * 60 * 60 * 1000 })
    try { console.log('[downloads] signed urls minted', { bucket: bucketName, objectPath, contentType }) } catch {}
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try { console.error('[downloads] sign url error', msg) } catch {}
    res.status(500).json({ error: 'Failed to mint signed URLs', details: msg })
    return
  }

  // Fast-path: If we’ve already processed this URL, return existing job with a fresh GET URL
  try {
    const existingId = await getJobIdBySource(payload.youtubeUrl)
    if (existingId) {
      const existing = await getJob(existingId)
      if (existing) {
        // If the cached job previously failed, DO NOT reuse it — start a new run instead.
        if (existing.status === 'failed') {
          try { console.warn('[downloads] cache hit but previous run failed — retrying with new job', { prevJobId: existingId }) } catch {}
        } else {
          // If completed and we know GCS object, mint a fresh read URL and return 200
          if (existing.status === 'completed' && existing.gcsObject) {
            try {
              const file = (keyJson || process.env.GCP_PROJECT_ID) ?
                (() => {
                  let s: Storage
                  if (keyJson) {
                    const sa = JSON.parse(keyJson)
                    s = new Storage({ projectId: sa.project_id, credentials: { client_email: sa.client_email, private_key: String(sa.private_key || '').replace(/\\n/g, '\n') } })
                  } else {
                    s = new Storage({ projectId: process.env.GCP_PROJECT_ID, credentials: { client_email: process.env.GCP_CLIENT_EMAIL!, private_key: String(process.env.GCP_PRIVATE_KEY).replace(/\\n/g, '\n') } })
                  }
                  return s.bucket(existing.gcsObject!.bucket).file(existing.gcsObject!.path)
                })() : new Storage().bucket(existing.gcsObject.bucket).file(existing.gcsObject.path)
              const [freshGet] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 2 * 60 * 60 * 1000 })
              try { console.log('[downloads] cache hit (source→job)', { jobId: existingId, status: 'completed', backend: process.env.REDIS_KV_REDIS_URL ? 'redis' : 'kv/memory' }) } catch {}
              return res.status(200).json({ jobId: existingId, statusUrl: `/api/downloads/${existingId}`, getUrl: freshGet, apifyRunId: existing.apifyRunId })
            } catch {}
          }
          // Otherwise let client attach to existing job
          try { console.log('[downloads] cache hit (source→job)', { jobId: existingId, status: existing.status, backend: process.env.REDIS_KV_REDIS_URL ? 'redis' : 'kv/memory' }) } catch {}
          return res.status(202).json({ jobId: existingId, statusUrl: `/api/downloads/${existingId}`, getUrl: existing.url, apifyRunId: existing.apifyRunId })
        }
      }
    }
  } catch {}

  const ACTOR = process.env.APIFY_ACTOR_ID
  const TOKEN = process.env.APIFY_TOKEN
  if (!ACTOR || !TOKEN) {
    res.status(500).json({ error: 'APIFY_ACTOR_ID or APIFY_TOKEN not set' })
    return
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

  let runId: string | undefined
  // Persist job immediately so first polls do not 404 during actor startup
  await putJob({ id: jobId, status: 'queued', workerUrl: 'apify', gcsObject: { bucket: bucketName, path: objectPath, contentType }, url: getUrl, sourceUrl: payload.youtubeUrl })
  await setJobIdForSource(payload.youtubeUrl, jobId)

  try {
    try { console.log('[downloads] apify:start', { actor: ACTOR, country: actorInput.proxyConfiguration.apifyProxyCountry, format: actorInput.audioFormat }) } catch {}
    const resp = await fetch(startUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(actorInput) })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      try { console.error('[downloads] apify:start:failed', { status: resp.status, body: text?.slice?.(0, 300) }) } catch {}
      res.status(502).json({ error: 'Apify start failed', status: resp.status, body: text })
      return
    }
    const data = await resp.json().catch(() => ({} as any))
    runId = data?.data?.id
    try { console.log('[downloads] apify:start:ok', { jobId, runId }) } catch {}
    await updateJob(jobId, { status: 'working', apifyRunId: runId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    try { console.error('[downloads] apify:start:error', msg) } catch {}
    res.status(502).json({ error: 'Failed to contact Apify', details: msg })
    return
  }

  try { console.log('[downloads] queued', { jobId, runId, statusUrl: `/api/downloads/${jobId}` }) } catch {}
  res.status(202).json({ jobId, statusUrl: `/api/downloads/${jobId}`, getUrl, apifyRunId: runId })
}
