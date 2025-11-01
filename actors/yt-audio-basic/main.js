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

import { Actor, log } from 'apify';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
const execFileAsync = promisify(execFile);

function parseJsonLines(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  throw new Error('yt-dlp metadata JSON not found in output');
}

function extractApproximateBytes(metadata) {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const requested = Array.isArray(metadata.requested_downloads) ? metadata.requested_downloads[0] : undefined;
  const formats = Array.isArray(metadata.formats) ? metadata.formats : [];
  const requestedFormat = requested?.format_id ? formats.find((fmt) => fmt.format_id === requested.format_id) : undefined;
  const candidates = [
    requested?.filesize,
    requested?.filesize_approx,
    requestedFormat?.filesize,
    requestedFormat?.filesize_approx,
    metadata.filesize,
    metadata.filesize_approx,
  ];
  return candidates.find((val) => typeof val === 'number' && Number.isFinite(val));
}

function detectContentType(filePath) {
  if (filePath.endsWith('.mp3')) return 'audio/mpeg';
  if (filePath.endsWith('.m4a') || filePath.endsWith('.mp4')) return 'audio/mp4';
  if (filePath.endsWith('.ogg')) return 'audio/ogg';
  if (filePath.endsWith('.webm')) return 'audio/webm';
  return 'application/octet-stream';
}

function defaultUA() {
  // Modern desktop UA helps avoid some server-side filtering
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
}
function looks403(err) {
  const s = String(err?.stderr || err?.stdout || err?.message || err);
  return /HTTP\s*Error\s*403|403:\s*Forbidden/i.test(s);
}

await Actor.main(async () => {
  const input = (await Actor.getInput()) ?? {};
  const {
    youtubeUrl,
    audioFormat = 'm4a',
    userAgent,
    cookiesTxt,
    proxyConfiguration,
    formatExpr = 'bestaudio[ext=m4a]/140/234/bestaudio',
    uploadUrl,
    callbackUrl,
    callbackSecret,
    jobId,
    maxDurationSeconds: rawMaxDurationSeconds,
    maxFileSizeBytes: rawMaxFileSizeBytes,
  } = input;

  const maxDurationSeconds = typeof rawMaxDurationSeconds === 'number' && rawMaxDurationSeconds > 0 ? rawMaxDurationSeconds : 600;
  const maxFileSizeBytes = typeof rawMaxFileSizeBytes === 'number' && rawMaxFileSizeBytes > 0 ? rawMaxFileSizeBytes : 100 * 1024 * 1024;

  if (!youtubeUrl) throw new Error('youtubeUrl is required');

  // Proxy
  let proxyUrl;
  if (proxyConfiguration && (proxyConfiguration.useApifyProxy || (proxyConfiguration.proxyUrls && proxyConfiguration.proxyUrls.length))) {
    const proxyConf = await Actor.createProxyConfiguration(proxyConfiguration);
    proxyUrl = await proxyConf.newUrl();
  }

  // Cookies
  let cookiesPath = null;
  if (cookiesTxt) {
    cookiesPath = '/tmp/cookies.txt';
    if (/^https?:\/\//i.test(cookiesTxt)) {
      const resp = await fetch(cookiesTxt);
      if (!resp.ok) throw new Error(`Failed to fetch cookies URL: ${resp.status}`);
      await fs.writeFile(cookiesPath, await resp.text(), 'utf8');
    } else {
      await fs.writeFile(cookiesPath, cookiesTxt, 'utf8');
    }
  }

  const outBase = '/tmp/out';

  const sharedArgsBase = [];
  if (cookiesPath) sharedArgsBase.push('--cookies', cookiesPath);
  sharedArgsBase.push('--user-agent', userAgent || defaultUA());
  if (proxyUrl) sharedArgsBase.push('--proxy', proxyUrl);

  const runYtDlp = async (baseArgs, useProxy = true) => {
    const shared = [...sharedArgsBase];
    if (!useProxy) {
      const i = shared.indexOf('--proxy');
      if (i !== -1) shared.splice(i, 2);
    }
    const fullArgs = [youtubeUrl, ...baseArgs, ...shared];
    return execFileAsync('yt-dlp', fullArgs, { maxBuffer: 1024 * 1024 * 64 });
  };

  // --- Preflight metadata (same constraints you added) ---
  try {
    const metaArgs = ['-f', formatExpr, '--skip-download', '--no-playlist', '--no-progress', '--dump-json', '--force-ipv4'];
    const { stdout } = await runYtDlp(metaArgs, true);
    const metadata = parseJsonLines(stdout);
    const estimatedDuration = typeof metadata?.duration === 'number' ? metadata.duration : undefined;
    const estimatedBytes = extractApproximateBytes(metadata);

    log.info('yt-dlp metadata', { jobId, duration: estimatedDuration, approxBytes: estimatedBytes, title: metadata?.title });

    if (maxDurationSeconds > 0 && estimatedDuration && estimatedDuration > maxDurationSeconds) {
      log.warning('Skipping download due to duration limit', { jobId, duration: estimatedDuration, maxDurationSeconds });
      await Actor.pushData({ status: 'skipped', reason: 'duration_exceeded', jobId, duration: estimatedDuration, maxDurationSeconds });
      throw new Error(`MEDIA_TOO_LONG: duration ${estimatedDuration}s > ${maxDurationSeconds}s`);
    }
    if (maxFileSizeBytes > 0 && estimatedBytes && estimatedBytes > maxFileSizeBytes) {
      log.warning('Skipping download due to size limit', { jobId, estimatedBytes, maxFileSizeBytes });
      await Actor.pushData({ status: 'skipped', reason: 'filesize_exceeded', jobId, estimatedBytes, maxFileSizeBytes });
      throw new Error(`MEDIA_TOO_LARGE: estimated ${estimatedBytes} bytes > ${maxFileSizeBytes} bytes`);
    }
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith('MEDIA_TOO_LONG') || err.message.startsWith('MEDIA_TOO_LARGE'))) throw err;
    log.warning('Metadata preflight failed; continuing', { jobId, error: err instanceof Error ? err.message : String(err) });
  }

  // --- Download ---
  const dlArgs = ['-f', formatExpr, '-x', '--audio-format', audioFormat, '-o', `${outBase}.%(ext)s`, '--no-playlist', '--force-ipv4', '-q'];

  log.info('Running yt-dlp', {
    url: youtubeUrl, formatExpr, audioFormat,
    hasCookies: Boolean(cookiesPath), hasProxy: Boolean(proxyUrl), jobId,
  });

  try {
    await runYtDlp(dlArgs, true);
  } catch (err) {
    const is403 = looks403(err);
    log.exception(err, 'yt-dlp failed');
    if (is403 && proxyUrl) {
      log.warning('Retrying once without proxy due to 403', { jobId });
      await runYtDlp(dlArgs, false);
    } else {
      throw err;
    }
  }

  // --- Output file ---
  const candidates = ['m4a', 'mp3', 'ogg', 'webm', 'mp4'].map(ext => `${outBase}.${ext}`);
  let filePath = null;
  for (const p of candidates) { try { await fs.stat(p); filePath = p; break; } catch {} }
  if (!filePath) throw new Error('Output file not found');

  const contentType = detectContentType(filePath);
  const { size } = await fs.stat(filePath);

  // --- Upload to GCS (preferred) ---
  let uploadedToGcs = false;
  if (uploadUrl) {
    try {
      log.info('Uploading to GCS via signed PUT', { jobId });
      const body = createReadStream(filePath);
      const resp = await fetch(uploadUrl, { method: 'PUT', duplex: 'half', headers: { 'Content-Type': contentType, 'Content-Length': String(size) }, body });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`GCS PUT failed: ${resp.status} ${text?.slice(0, 300)}`);
      }
      uploadedToGcs = true;
    } catch (e) {
      log.warning('GCS PUT failed, will fall back to KVS storage', { err: String(e) });
    }
  }

  // --- Fallback: KVS ---
  let kvsDownloadUrl;
  if (!uploadedToGcs) {
    const buf = await fs.readFile(filePath);
    await Actor.setValue('audio', buf, { contentType });
    const env = Actor.getEnv();
    kvsDownloadUrl = `https://api.apify.com/v2/key-value-stores/${env.defaultKeyValueStoreId}/records/audio?token=${env.token}`;
  }

  // --- Optional callback ---
  if (callbackUrl) {
    const payload = { jobId, status: 'completed', bytes: size, contentType, fallbackKvsUrl: uploadedToGcs ? undefined : kvsDownloadUrl };
    const raw = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };
    if (callbackSecret) {
      const sig = crypto.createHmac('sha256', callbackSecret).update(raw).digest('hex');
      headers['X-Signature'] = sig;
    }
    try {
      const resp = await fetch(callbackUrl, { method: 'POST', headers, body: raw });
      if (!resp.ok) log.warning('Callback returned non-2xx', { status: resp.status });
    } catch (e) {
      log.warning('Callback POST failed', { err: String(e) });
    }
  }

  const result = { status: 'completed', jobId, uploadedToGcs, contentType, bytes: size, kvsUrl: uploadedToGcs ? undefined : kvsDownloadUrl };
  await Actor.pushData(result);
  log.info('Done', result);
});

