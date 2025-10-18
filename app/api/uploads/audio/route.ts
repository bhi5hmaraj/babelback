import '../../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { gaEvent } from '../../_lib/ga'
import { getStorageProvider } from '../../_lib/storage'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 })
  }

  const bucketName = process.env.GCS_BUCKET
  if (!bucketName) {
    return NextResponse.json({ error: 'GCS_BUCKET not set' }, { status: 500 })
  }

  const contentType = req.headers.get('content-type') || 'application/octet-stream'
  const rawName = req.headers.get('x-file-name') || 'upload.bin'
  const fileName = rawName.replace(/[^\w\.\-\s]/g, '_')
  const id = crypto.randomUUID()
  const objectPath = `uploads/${id}-${fileName}`

  const buffer = Buffer.from(await req.arrayBuffer())

  const storage = getStorageProvider()

  const startedAt = Date.now()
  try {
    await storage.uploadBuffer(bucketName, objectPath, buffer, contentType)
  } catch (err: any) {
    try {
      console.error('[uploads/audio] gcs error', err?.message || String(err))
    } catch {}
    try {
      gaEvent('upload_error', {
        source: 'file',
        error_type: 'upload',
        content_type: contentType,
        duration_ms: Date.now() - startedAt,
        ok: 0,
        msg: String(err?.message || err).slice(0, 120),
      })
    } catch {}
    return NextResponse.json({ error: 'gcs upload failed', details: err?.message || String(err) }, { status: 502 })
  }

  let signedUrl: string | undefined
  try {
    signedUrl = await storage.getSignedReadUrl(bucketName, objectPath)
    try {
      gaEvent('upload_done', {
        source: 'file',
        content_type: contentType,
        size_bytes: buffer.byteLength,
        upload_duration_ms: Date.now() - startedAt,
        ok: 1,
      })
    } catch {}
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        id,
        gcsObject: { bucket: bucketName, path: objectPath, contentType, size: buffer.byteLength },
        warning: `signed url failed: ${msg}`,
      },
      { status: 200 },
    )
  }

  return NextResponse.json(
    {
      id,
      url: signedUrl,
      gcsObject: { bucket: bucketName, path: objectPath, contentType, size: buffer.byteLength },
    },
    { status: 200 },
  )
}
