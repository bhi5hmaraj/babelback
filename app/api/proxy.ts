/**
 * Lightweight streaming proxy for signed GCS URLs to avoid CORS issues in the browser.
 * GET /api/proxy?url=<signed-gcs-url>
 */
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET') {
    if (res.setHeader) res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method not allowed. Use GET.' })
    return
  }
  const url = (req.query?.url && (Array.isArray(req.query.url) ? req.query.url[0] : req.query.url)) || ''
  if (!url) { res.status(400).json({ error: 'missing url' }); return }
  let parsed: URL
  try { parsed = new URL(url) } catch { res.status(400).json({ error: 'invalid url' }); return }

  // Very basic allowlist: only proxy Google Cloud Storage signed URLs for our bucket
  const allowedHosts = new Set(['storage.googleapis.com'])
  if (!allowedHosts.has(parsed.hostname)) {
    res.status(400).json({ error: 'host not allowed' }); return
  }
  const bucket = process.env.GCS_BUCKET || ''
  if (bucket && !parsed.pathname.startsWith(`/${bucket}/`)) {
    res.status(400).json({ error: 'bucket not allowed' }); return
  }

  try {
    const upstream = await fetch(parsed.toString())
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.status(upstream.status)
    if (res.setHeader) {
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    res.end(buf)
  } catch (e) {
    res.status(502).json({ error: 'proxy fetch failed' })
  }
}
