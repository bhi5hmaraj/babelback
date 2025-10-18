import '../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { getStorageProvider } from '../_lib/storage'

export const runtime = 'nodejs'

/**
 * /api/media endpoint
 *
 * Generates signed URLs for GCS objects on-demand.
 * Used for playback of cached songs and seed files.
 *
 * Query params:
 *   - bucket: GCS bucket name (required)
 *   - path: Object path within bucket (required)
 *   - expiresIn: Expiration time in seconds (optional, default: 7200 = 2 hours)
 *
 * Example: /api/media?bucket=my-bucket&path=downloads/abc123.m4a
 */

interface MediaRequestParams {
  bucket: string
  path: string
  expiresIn?: number
  mode: 'json' | 'download'
}

const DEFAULT_EXPIRY_SECONDS = 2 * 60 * 60 // 2 hours
const MAX_EXPIRY_SECONDS = 7 * 24 * 60 * 60 // 7 days

function parseRequestParams(req: NextRequest): MediaRequestParams {
  const { searchParams } = new URL(req.url)

  const bucket = searchParams.get('bucket')
  const path = searchParams.get('path')
  const expiresInStr = searchParams.get('expiresIn')
  const modeParam = searchParams.get('mode')

  if (!bucket) {
    throw new Error('Missing required query parameter: bucket')
  }
  if (!path) {
    throw new Error('Missing required query parameter: path')
  }

  let expiresIn = DEFAULT_EXPIRY_SECONDS
  if (expiresInStr) {
    const parsed = parseInt(expiresInStr, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('Invalid expiresIn value: must be a positive integer')
    }
    if (parsed > MAX_EXPIRY_SECONDS) {
      throw new Error(`expiresIn exceeds maximum of ${MAX_EXPIRY_SECONDS} seconds (7 days)`)
    }
    expiresIn = parsed
  }

  const mode = modeParam === 'download' ? 'download' : 'json'

  return { bucket, path, expiresIn, mode }
}

export async function GET(req: NextRequest) {
  try { console.log('[media] request', new URL(req.url).search) } catch {}
  let params: MediaRequestParams
  try {
    params = parseRequestParams(req)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request parameters'
    try {
      console.error('[media] bad request', { error: message, url: req.url })
    } catch {}
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { bucket, path, expiresIn, mode } = params

  try {
    const storage = getStorageProvider()
    if (mode === 'download') {
      const { buffer, contentType } = await storage.downloadBuffer(bucket, path)
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Cache-Control': `public, max-age=${Math.floor(expiresIn)}`,
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const signedUrl = await storage.getSignedReadUrl(bucket, path, {
      expiresInMs: expiresIn * 1000,
    })

    try {
      console.log('[media] signed url generated', {
        bucket,
        path,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
      })
    } catch {}

    return NextResponse.json({
      signedUrl,
      bucket,
      path,
      expiresIn,
      expiresAt: Date.now() + expiresIn * 1000,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      console.error('[media] failed to generate signed url', {
        bucket,
        path,
        error: message
      })
    } catch {}
    return NextResponse.json(
      { error: 'Failed to generate signed URL', details: message },
      { status: 500 }
    )
  }
}
