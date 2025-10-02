import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import { updateJob } from '../../_lib/downloadJobs'

function verifyHmac(raw: string, signature: string | undefined, secret: string | undefined) {
  if (!secret) return true
  if (!signature) return false
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }
  const { id } = req.query
  const jobId = Array.isArray(id) ? id[0] : id
  if (!jobId) return res.status(400).json({ error: 'missing id' })

  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
  const signature = (req.headers['x-signature'] as string) || ''
  const ok = verifyHmac(raw, signature, process.env.CALLBACK_SECRET)
  if (!ok) return res.status(401).json({ error: 'bad signature' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { status, bytes, contentType, fallbackKvsUrl } = body || {}
    const patch: any = {}
    if (status) patch.status = status === 'completed' ? 'completed' : status
    if (fallbackKvsUrl) patch.url = fallbackKvsUrl
    if (contentType) patch.gcsObject = { ...(patch.gcsObject || {}), contentType }
    if (bytes) patch.gcsObject = { ...(patch.gcsObject || {}), size: Number(bytes) }
    const updated = updateJob(jobId, patch)
    if (!updated) return res.status(404).json({ error: 'job not found' })
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(400).json({ error: 'invalid json' })
  }
}

