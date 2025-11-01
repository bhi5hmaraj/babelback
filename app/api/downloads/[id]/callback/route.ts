import '../../../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { updateJob } from '../../../_lib/jobStore'

export const runtime = 'nodejs'

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
    if (status) patch.status = status === 'completed' ? 'completed' : status
    if (fallbackKvsUrl) patch.url = fallbackKvsUrl
    if (contentType || bytes) {
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
