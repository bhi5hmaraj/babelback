/**
 * Streaming proxy for signed GCS URLs to avoid CORS issues in the browser.
 * GET /api/proxy?url=<signed-gcs-url>
 *
 * Hardened against SSRF: only GCS hosts are allowed, and (when buckets are
 * configured) the object path must live under an allowed bucket. The upstream
 * body is streamed through rather than buffered into memory.
 */
import '../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { isAllowedAudioUrl } from '../_lib/gcsUrl'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url') || ''
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  // SSRF guard: only proxy our own GCS objects or the Apify KVS fallback.
  if (!isAllowedAudioUrl(url)) {
    return NextResponse.json({ error: 'url not allowed' }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(url, { redirect: 'follow' })
  } catch {
    return NextResponse.json({ error: 'proxy fetch failed' }, { status: 502 })
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  }
  const len = upstream.headers.get('content-length')
  if (len) headers['Content-Length'] = len

  // Stream the upstream body straight through (no full buffering).
  return new NextResponse(upstream.body, { status: upstream.status, headers })
}
