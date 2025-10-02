import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Storage } from '@google-cloud/storage'
import crypto from 'node:crypto'
import { getJob, newId, putJob, updateJob } from './_lib/downloadJobs'

function absoluteUrl(req: VercelRequest, path: string) {
  const base = process.env.BASE_URL
  if (base) return `${base.replace(/\/$/, '')}${path}`
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string)
  return `${proto}://${host}${path}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true })
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET')
    return res.status(405).end('Method Not Allowed')
  }

  const { youtubeUrl, audioFormat = 'm4a', country = 'US' } = req.body || {}
  if (!youtubeUrl || typeof youtubeUrl !== 'string') {
    return res.status(400).json({ error: 'youtubeUrl required' })
  }

  const jobId = newId()
  const bucketName = process.env.GCS_BUCKET
  if (!bucketName) return res.status(500).json({ error: 'GCS_BUCKET not set' })

  const contentType = audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/mp4'
  const objectPath = `downloads/${jobId}.${audioFormat}`

  // Mint V4 signed PUT + short-lived GET
  // Use explicit credentials from env for Vercel (no files on disk)
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
    } catch (e) {
      return res.status(500).json({ error: 'Invalid GCP_SERVICE_ACCOUNT_KEY JSON' })
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
    // Fallback to ADC if running locally with GOOGLE_APPLICATION_CREDENTIALS
    storage = new Storage()
  }
  const file = storage.bucket(bucketName).file(objectPath)
  const [uploadUrl] = await file.getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + 30 * 60 * 1000, contentType })
  const [getUrl] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 2 * 60 * 60 * 1000 })

  // TODO(webhooks): When enabling webhooks/SSE, build a callbackUrl here and pass it to the actor.

  // Start Apify run
  const ACTOR = process.env.APIFY_ACTOR_ID
  const TOKEN = process.env.APIFY_TOKEN
  if (!ACTOR || !TOKEN) return res.status(500).json({ error: 'APIFY_ACTOR_ID or APIFY_TOKEN not set' })

  const startUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${encodeURIComponent(TOKEN)}`
  const actorInput = {
    youtubeUrl,
    audioFormat,
    formatExpr: 'bestaudio[ext=m4a]/140/234/bestaudio',
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: country },
    uploadUrl,
    jobId,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  }

  try {
    const resp = await fetch(startUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return res.status(502).json({ error: 'Apify start failed', status: resp.status, body: text })
    }
    // Polling-first mode: capture runId for status checks
    const data = await resp.json().catch(() => ({} as any))
    const runId: string | undefined = data?.data?.id
    putJob({
      id: jobId,
      status: 'running',
      workerUrl: 'apify',
      gcsObject: { bucket: bucketName, path: objectPath, contentType },
      url: getUrl,
      apifyRunId: runId,
    })
  } catch (err) {
    return res.status(502).json({ error: 'Failed to contact Apify', details: String(err) })
  }

  return res.status(202).json({ jobId, statusUrl: `/api/downloads/${jobId}`, getUrl })
}
