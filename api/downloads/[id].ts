import '../_lib/loadEnv.js'
import { getJob, updateJob } from '../_lib/jobStore.js'
import { Storage } from '@google-cloud/storage'

interface VercelRequest { method?: string; query: Record<string, string | string[] | undefined> }
interface VercelResponse { status: (code: number) => VercelResponse; json: (b: unknown) => void; setHeader?: (k: string, v: string) => void; end?: (b?: any) => void }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET') {
    if (res.setHeader) res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method not allowed. Use GET.' })
    return
  }

  const { id } = req.query
  const jobId = Array.isArray(id) ? id[0] : id
  if (!jobId) { res.status(400).json({ error: 'missing id' }); return }
  let job = await getJob(jobId)
  // If job missing (cold start/another instance), try to infer completion by probing GCS
  if (!job) {
    const bucketName = process.env.GCS_BUCKET
    if (bucketName) {
      // Try common extensions
      const makeStorage = () => {
        const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY
        if (keyJson) {
          try {
            const sa = JSON.parse(keyJson)
            return new Storage({ projectId: sa.project_id, credentials: { client_email: sa.client_email, private_key: String(sa.private_key || '').replace(/\\n/g, '\n') } })
          } catch {}
        }
        if (process.env.GCP_PROJECT_ID && process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
          return new Storage({ projectId: process.env.GCP_PROJECT_ID, credentials: { client_email: process.env.GCP_CLIENT_EMAIL!, private_key: String(process.env.GCP_PRIVATE_KEY).replace(/\\n/g, '\n') } })
        }
        return new Storage()
      }
      try {
        const storage = makeStorage()
        const exts = ['m4a', 'mp3'] as const
        for (const ext of exts) {
          const path = `downloads/${jobId}.${ext}`
          const file = storage.bucket(bucketName).file(path)
          const [exists] = await file.exists()
          if (exists) {
            const [signed] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 2 * 60 * 60 * 1000 })
            job = { id: jobId, status: 'completed', workerUrl: 'apify', url: signed, gcsObject: { bucket: bucketName, path } }
            // Cache it for future polls
            await updateJob(jobId, job)
            break
          }
        }
      } catch {}
    }
  }
  if (!job) { res.status(200).json({ id: jobId, status: 'queued' }); return }

  // Always try to poll Apify when a runId exists, so clients see the source-of-truth status
  let apifyStatus: string | undefined
  if (job.apifyRunId && process.env.APIFY_TOKEN) {
    try {
      const runUrl = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(job.apifyRunId)}?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`
      const resp = await fetch(runUrl)
      if (resp.ok) {
        const data = await resp.json().catch(() => ({} as any))
        const status = (data?.data?.status as string | undefined) || ''
        apifyStatus = status
        if (status === 'SUCCEEDED' && job.status !== 'completed') await updateJob(jobId, { status: 'completed' })
        else if ((status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') && job.status !== 'failed') await updateJob(jobId, { status: 'failed', error: { message: status } })
      }
    } catch (e) {
      try { console.warn('[downloads:id] apify poll failed', String(e)) } catch {}
    }
  }

  // Mint a fresh read URL if we have a GCS object (avoid stale signed URLs)
  let freshUrl: string | undefined = undefined
  try {
    const current = await getJob(jobId)
    const finalRec = current ?? job
    if (finalRec?.gcsObject) {
      const bucketName = finalRec.gcsObject.bucket
      const path = finalRec.gcsObject.path
      const makeStorage = () => {
        const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY
        if (keyJson) {
          try { const sa = JSON.parse(keyJson); return new Storage({ projectId: sa.project_id, credentials: { client_email: sa.client_email, private_key: String(sa.private_key || '').replace(/\\n/g, '\n') } }) } catch {}
        }
        if (process.env.GCP_PROJECT_ID && process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
          return new Storage({ projectId: process.env.GCP_PROJECT_ID, credentials: { client_email: process.env.GCP_CLIENT_EMAIL!, private_key: String(process.env.GCP_PRIVATE_KEY).replace(/\\n/g, '\n') } })
        }
        return new Storage()
      }
      const storage = makeStorage()
      const file = storage.bucket(bucketName).file(path)
      const [signed] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 2 * 60 * 60 * 1000 })
      freshUrl = signed
    }
    res.status(200).json({
      id: jobId,
      status: finalRec?.status ?? 'unknown',
      url: freshUrl ?? finalRec?.url,
      gcsObject: finalRec?.gcsObject,
      error: finalRec?.error,
      apifyRunId: finalRec?.apifyRunId,
      apifyStatus: apifyStatus,
    })
  } catch {
    const current = await getJob(jobId)
    const finalRec = current ?? job
    res.status(200).json({ id: jobId, status: finalRec?.status ?? 'unknown', url: finalRec?.url, gcsObject: finalRec?.gcsObject, error: finalRec?.error, apifyRunId: finalRec?.apifyRunId, apifyStatus })
  }
}
