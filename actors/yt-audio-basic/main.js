/**
 * yt-audio-basic Actor
 *
 * Purpose
 * - Download audio for a single YouTube URL using yt-dlp (+ ffmpeg).
 * - Preferred output is m4a (AAC) for broad browser support.
 *
 * Deployment model (recommended)
 * - Hono (Edge) starts a job and mints a short-lived GCS V4 signed PUT URL.
 * - Hono calls this Actor with { youtubeUrl, uploadUrl, callbackUrl, jobId, ... }.
 * - Actor downloads audio, then PUTs the file directly to the provided GCS uploadUrl.
 * - Actor finally POSTs the callbackUrl with status and metadata (size, contentType),
 *   optionally HMAC-signed with callbackSecret. Hono (Node) records completion and
 *   mints a signed GET URL for the client.
 *
 * Fallbacks
 * - If uploadUrl is missing or the PUT fails, the Actor stores the file in the
 *   run Key-Value Store (key: "audio"). This enables manual retrieval but is
 *   less efficient than direct GCS upload.
 */

import { Actor, log } from 'apify'
import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
const execFileAsync = promisify(execFile)

function detectContentType(filePath) {
  if (filePath.endsWith('.mp3')) return 'audio/mpeg'
  if (filePath.endsWith('.m4a') || filePath.endsWith('.mp4')) return 'audio/mp4'
  if (filePath.endsWith('.ogg')) return 'audio/ogg'
  if (filePath.endsWith('.webm')) return 'audio/webm'
  return 'application/octet-stream'
}

await Actor.main(async () => {
  const input = (await Actor.getInput()) ?? {}
  const {
    youtubeUrl,
    audioFormat = 'm4a',
    userAgent,
    cookiesTxt,
    proxyConfiguration,
    formatExpr = 'bestaudio[ext=m4a]/140/234/bestaudio',
    // Direct-to-GCS parameters, provided by Hono (Edge) at job start
    uploadUrl,            // V4 signed PUT URL (optional)
    callbackUrl,          // Hono webhook to report completion (optional)
    callbackSecret,       // HMAC secret for webhook signing (optional)
    jobId                 // Correlation id for logging and callback payload (optional)
  } = input

  if (!youtubeUrl) throw new Error('youtubeUrl is required')

  // Proxy: prefer new "proxyConfiguration" editor if provided
  let proxyUrl
  if (proxyConfiguration && (proxyConfiguration.useApifyProxy || (proxyConfiguration.proxyUrls && proxyConfiguration.proxyUrls.length))) {
    const proxyConf = await Actor.createProxyConfiguration(proxyConfiguration)
    // newUrl() returns a Promise in Apify SDK v3
    proxyUrl = await proxyConf.newUrl()
  }

  // Optional cookies
  let cookiesPath = null
  if (cookiesTxt) {
    cookiesPath = '/tmp/cookies.txt'
    // If cookiesTxt looks like a URL, fetch content; otherwise treat as raw Netscape text
    if (/^https?:\/\//i.test(cookiesTxt)) {
      const resp = await fetch(cookiesTxt)
      if (!resp.ok) throw new Error(`Failed to fetch cookies URL: ${resp.status}`)
      const text = await resp.text()
      await fs.writeFile(cookiesPath, text, 'utf8')
    } else {
      await fs.writeFile(cookiesPath, cookiesTxt, 'utf8')
    }
  }

  const outBase = '/tmp/out'
  const args = [
    youtubeUrl,
    '-f', formatExpr,
    '-x', '--audio-format', audioFormat,
    '-o', `${outBase}.%(ext)s`,
    '--no-playlist', '--force-ipv4', '-q'
  ]
  if (cookiesPath) args.push('--cookies', cookiesPath)
  if (userAgent) args.push('--user-agent', userAgent)
  if (proxyUrl) args.push('--proxy', proxyUrl)

  // Avoid logging secrets/long strings. Show minimal command context.
  log.info('Running yt-dlp', {
    url: youtubeUrl,
    formatExpr,
    audioFormat,
    hasCookies: Boolean(cookiesPath),
    hasProxy: Boolean(proxyUrl),
    jobId,
  })

  try {
    await execFileAsync('yt-dlp', args, { maxBuffer: 1024 * 1024 * 64 })
  } catch (err) {
    log.exception(err, 'yt-dlp failed')
    throw err
  }

  // Find the output file (m4a/mp3)
  const candidates = ['m4a', 'mp3', 'ogg', 'webm', 'mp4'].map(ext => `${outBase}.${ext}`)
  let filePath = null
  for (const p of candidates) {
    try { await fs.stat(p); filePath = p; break } catch {}
  }
  if (!filePath) throw new Error('Output file not found')

  const contentType = detectContentType(filePath)
  const { size } = await fs.stat(filePath)

  // Preferred: PUT directly to GCS when uploadUrl is provided
  let uploadedToGcs = false
  if (uploadUrl) {
    try {
      log.info('Uploading to GCS via signed PUT', { jobId })
      const body = createReadStream(filePath)
      const resp = await fetch(uploadUrl, {
        method: 'PUT',
        // Node.js fetch requires duplex: 'half' when streaming a body
        // See: https://github.com/nodejs/undici/issues/2588
        duplex: 'half',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(size),
        },
        body,
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`GCS PUT failed: ${resp.status} ${text?.slice(0, 300)}`)
      }
      uploadedToGcs = true
    } catch (e) {
      log.warning('GCS PUT failed, will fall back to KVS storage', { err: String(e) })
    }
  }

  // Fallback: save to Actor KVS if direct upload wasn’t used
  let kvsDownloadUrl
  if (!uploadedToGcs) {
    const buf = await fs.readFile(filePath)
    await Actor.setValue('audio', buf, { contentType })
    const env = Actor.getEnv()
    kvsDownloadUrl = `https://api.apify.com/v2/key-value-stores/${env.defaultKeyValueStoreId}/records/audio?token=${env.token}`
  }

  // Optional webhook back to Hono (Node): include jobId, status, and metadata
  if (callbackUrl) {
    const payload = {
      jobId,
      status: 'completed',
      bytes: size,
      contentType,
      // When uploadedToGcs===true, Hono already knows the object (it minted the PUT URL).
      // When false, we include the Apify KVS fallback URL for manual retrieval.
      fallbackKvsUrl: uploadedToGcs ? undefined : kvsDownloadUrl,
    }
    const raw = JSON.stringify(payload)
    const headers = { 'Content-Type': 'application/json' }
    if (callbackSecret) {
      const sig = crypto.createHmac('sha256', callbackSecret).update(raw).digest('hex')
      headers['X-Signature'] = sig
    }
    try {
      const resp = await fetch(callbackUrl, { method: 'POST', headers, body: raw })
      if (!resp.ok) log.warning('Callback returned non-2xx', { status: resp.status })
    } catch (e) {
      log.warning('Callback POST failed', { err: String(e) })
    }
  }

  // Emit a small result for the Actor run (useful when testing via Apify console)
  const result = {
    status: 'completed',
    jobId,
    uploadedToGcs,
    contentType,
    bytes: size,
    kvsUrl: uploadedToGcs ? undefined : kvsDownloadUrl,
  }
  await Actor.pushData(result)
  log.info('Done', result)
})
