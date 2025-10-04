import '../_lib/loadEnv.js'
import { tLog } from '../_lib/telemetry.js'
import { Storage } from '@google-cloud/storage'
import crypto from 'node:crypto'

interface VercelResponse { status: (code: number) => VercelResponse; json: (b: unknown) => void; setHeader?: (k: string, v: string) => void; end?: (b?: any) => void }

export default async function handler(req: any, res: VercelResponse) {
  if (req.method !== 'POST') {
    if (res.setHeader) res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  const bucketName = process.env.GCS_BUCKET
  if (!bucketName) { res.status(500).json({ error: 'GCS_BUCKET not set' }); return }

  const contentType = req.headers['content-type'] || 'application/octet-stream'
  const fileName = String(req.headers['x-file-name'] || 'upload.bin').replace(/[^\w\.\-\s]/g, '_')
  const id = crypto.randomUUID()
  const objectPath = `uploads/${id}-${fileName}`

function makeStorage(): Storage {
  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY
  try {
    if (keyJson) {
      const sa = JSON.parse(keyJson)
      return new Storage({ projectId: sa.project_id, credentials: { client_email: sa.client_email, private_key: String(sa.private_key || '').replace(/\\n/g, '\n') } })
    }
    if (process.env.GCP_PROJECT_ID && process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
      return new Storage({ projectId: process.env.GCP_PROJECT_ID, credentials: { client_email: process.env.GCP_CLIENT_EMAIL!, private_key: String(process.env.GCP_PRIVATE_KEY).replace(/\\n/g, '\n') } })
    }
  } catch {}
  return new Storage()
}

  const storage = makeStorage()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(objectPath)

  let bytes = 0
  const startedAt = Date.now()
  try { await tLog('upload_start', { contentType, fileName, path: objectPath }) } catch {}
  const stream = file.createWriteStream({
    resumable: true,
    contentType: String(contentType),
    metadata: { contentType: String(contentType) },
    validation: false,
  })

  req.on('data', (chunk: Buffer) => { bytes += chunk.length })
  req.on('aborted', () => { try { stream.destroy(new Error('client aborted')) } catch {} })

  stream.on('error', (err: any) => {
    try { console.error('[uploads/audio] gcs error', err?.message || String(err)) } catch {}
    try { tLog('upload_error', { contentType, fileName, path: objectPath, durationMs: Date.now() - startedAt, message: String(err?.message || err) }) } catch {}
    res.status(502).json({ error: 'gcs upload failed', details: err?.message || String(err) })
  })
  stream.on('finish', async () => {
    try {
      const [signed] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 2 * 60 * 60 * 1000 })
      try { await tLog('upload_done', { contentType, fileName, path: objectPath, sizeBytes: bytes, durationMs: Date.now() - startedAt }) } catch {}
      res.status(200).json({ id, url: signed, gcsObject: { bucket: bucketName, path: objectPath, contentType, size: bytes } })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      try { await tLog('upload_done', { contentType, fileName, path: objectPath, sizeBytes: bytes, durationMs: Date.now() - startedAt, warn: 'signed_url_failed' }) } catch {}
      res.status(200).json({ id, gcsObject: { bucket: bucketName, path: objectPath, contentType, size: bytes }, warning: `signed url failed: ${msg}` })
    }
  })

  // Start piping request to GCS
  req.pipe(stream)
}
