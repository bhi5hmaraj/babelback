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
import { allowedBuckets, parseGcsUrl } from '../_lib/gcsUrl'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url') || ''
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  const parsed = parseGcsUrl(url)
  if (!parsed) return NextResponse.json({ error: 'host not allowed' }, { status: 400 })

  // When buckets are configured, require the object to live under one of them.
  const buckets = allowedBuckets()
  if (buckets.length > 0 && !buckets.some((b) => parsed.pathname.startsWith(`/${b}/`))) {
    return NextResponse.json({ error: 'bucket not allowed' }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(parsed.toString(), { redirect: 'follow' })
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
