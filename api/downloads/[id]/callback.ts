import '../../_lib/loadEnv.js'
import crypto from 'node:crypto'
import { updateJob } from '../../_lib/jobStore.js'

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

interface VercelRequest { method?: string; headers: Record<string, string | undefined>; query: Record<string, string | string[] | undefined>; body?: unknown }
interface VercelResponse { status: (code: number) => VercelResponse; json: (b: unknown) => void; setHeader?: (k: string, v: string) => void; end?: (b?: any) => void }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'POST') {
    if (res.setHeader) res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }
  const { id } = req.query
  const jobId = Array.isArray(id) ? id[0] : id
  if (!jobId) { res.status(400).json({ error: 'missing id' }); return }

  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
  const signature = (req.headers['x-signature'] as string) || ''
  const ok = verifyHmac(raw, signature, process.env.CALLBACK_SECRET)
  if (!ok) { res.status(401).json({ error: 'bad signature' }); return }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body as any)
    const { status, bytes, contentType, fallbackKvsUrl } = body || {}
    const patch: any = {}
    if (status) patch.status = status === 'completed' ? 'completed' : status
    if (fallbackKvsUrl) patch.url = fallbackKvsUrl
    if (contentType) patch.gcsObject = { ...(patch.gcsObject || {}), contentType }
    if (bytes) patch.gcsObject = { ...(patch.gcsObject || {}), size: Number(bytes) }
    const updated = await updateJob(jobId, patch)
    if (!updated) { res.status(404).json({ error: 'job not found' }); return }
    res.status(200).json({ ok: true })
  } catch {
    res.status(400).json({ error: 'invalid json' })
  }
}
