import '../../../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { updateJob } from '../../../_lib/jobStore'

export const runtime = 'nodejs'

const ALLOWED_STATUSES = new Set(['queued', 'working', 'completed', 'failed'])
// Hosts we trust for a fallback download URL supplied by the callback.
const ALLOWED_FALLBACK_HOSTS = new Set(['api.apify.com', 'storage.googleapis.com'])

// Fail closed: an unconfigured secret means the endpoint cannot be authenticated,
// so reject rather than accept every request.
function verifyHmac(raw: string, signature: string | undefined, secret: string | undefined) {
  if (!secret) return false
  if (!signature) return false
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function isAllowedFallbackUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && ALLOWED_FALLBACK_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await context.params
  const jobId = resolvedParams?.id
  if (!jobId) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 })
  }

  const raw = await req.text()
  const signature = req.headers.get('x-signature') || undefined
  const ok = verifyHmac(raw, signature, process.env.CALLBACK_SECRET)
  if (!ok) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }

  try {
    const body = raw ? JSON.parse(raw) : {}
    const { status, bytes, contentType, fallbackKvsUrl } = body || {}
    const patch: Record<string, unknown> = {}
    if (status && ALLOWED_STATUSES.has(status)) patch.status = status
    if (isAllowedFallbackUrl(fallbackKvsUrl)) patch.url = fallbackKvsUrl
    if (contentType || bytes) {
      // Note: jobStore.updateJob deep-merges gcsObject, so bucket/path are preserved.
      patch.gcsObject = {
        contentType,
        size: bytes ? Number(bytes) : undefined,
      }
    }
    const updated = await updateJob(jobId, patch)
    if (!updated) {
      return NextResponse.json({ error: 'job not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
}
