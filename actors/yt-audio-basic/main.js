/**
 * yt-audio-basic: downloads the audio of one YouTube video with yt-dlp and ffmpeg.
 *
 * The babelback api starts a run with a presigned PUT URL for its bucket and polls the run.
 * The actor PUTs the audio there or fails the run. Before it refuses a video for length or
 * size, it writes { reason: 'duration_exceeded' | 'filesize_exceeded' } to the dataset,
 * which the api reads to tell the user why.
 * Without uploadUrl (a manual run from the console) the audio goes to the key-value store.
 * callbackUrl serves the old Vercel app until it is retired.
 */

import { Actor, log } from 'apify';
import { promises as fs } from 'node:fs';
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

  const refuse = async (reason, details) => {
    log.warning('Refusing video', { jobId, reason, ...details });
    await Actor.pushData({ status: 'skipped', reason, jobId, ...details });
    throw new Error(`${reason}: ${JSON.stringify(details)}`);
  };

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

  // --- Preflight: the limits hold only if this check runs, so its failure fails the run ---
  const metaArgs = ['-f', formatExpr, '--skip-download', '--no-playlist', '--no-progress', '--dump-json', '--force-ipv4'];
  const metadata = parseJsonLines((await runYtDlp(metaArgs, true)).stdout);
  const duration = typeof metadata.duration === 'number' ? metadata.duration : undefined;
  const estimatedBytes = extractApproximateBytes(metadata);
  log.info('yt-dlp metadata', { jobId, duration, approxBytes: estimatedBytes, isLive: metadata.is_live, title: metadata.title });

  // A live stream has no duration and would download until the run times out.
  if (metadata.is_live || duration === undefined || duration > maxDurationSeconds) {
    await refuse('duration_exceeded', { duration: duration ?? null, isLive: Boolean(metadata.is_live), maxDurationSeconds });
  }
  if (estimatedBytes && estimatedBytes > maxFileSizeBytes) {
    await refuse('filesize_exceeded', { estimatedBytes, maxFileSizeBytes });
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
  if (size > maxFileSizeBytes) await refuse('filesize_exceeded', { bytes: size, maxFileSizeBytes });

  // A Buffer body sends Content-Length; S3-style buckets refuse a chunked upload.
  const audio = await fs.readFile(filePath);
  if (uploadUrl) {
    log.info('Uploading via presigned PUT', { jobId, bytes: size });
    const resp = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: audio });
    if (!resp.ok) throw new Error(`Upload failed: ${resp.status} ${(await resp.text().catch(() => '')).slice(0, 300)}`);
  } else {
    await Actor.setValue('audio', audio, { contentType });
  }

  // --- Optional callback ---
  if (callbackUrl) {
    const payload = { jobId, status: 'completed', bytes: size, contentType };
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

  const result = { status: 'completed', jobId, uploaded: Boolean(uploadUrl), contentType, bytes: size };
  await Actor.pushData(result);
  log.info('Done', result);
});
