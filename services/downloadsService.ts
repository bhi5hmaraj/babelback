/** Response from POST /api/downloads when a job is created or reused. */
export type StartDownloadResponse = {
  jobId: string
  statusUrl: string
  getUrl?: string
  apifyRunId?: string
  apifyAccountLabel?: string
}

/** Status payload returned by GET /api/downloads/:id. */
export type DownloadStatus = {
  id: string
  status: 'queued' | 'working' | 'completed' | 'failed' | 'unknown'
  url?: string
  gcsObject?: { bucket: string; path: string; contentType?: string; size?: number }
  error?: { message: string }
  apifyRunId?: string
  apifyStatus?: string
  apifyAccountLabel?: string
  apifyDatasetId?: string
  apifyKeyValueStoreId?: string
}

/** Start a YouTube download-and-upload job via the server. */
export async function startDownload(
  youtubeUrl: string,
  audioFormat: 'm4a' | 'mp3' = 'm4a',
  country = 'IN',
  limits?: { maxDurationSeconds?: number; maxFileSizeBytes?: number }
): Promise<StartDownloadResponse> {
  const resp = await fetch('/api/downloads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ youtubeUrl, audioFormat, country, ...(limits || {}) })
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    trackEvent('download_start_error', { reason: text.slice(0, 120) || resp.status })
    throw new Error(text || `Failed to start download (${resp.status})`)
  }
  const data = await resp.json()
  trackEvent('download_start', { source: 'youtube', format: audioFormat, country })
  return data
}

/** Poll the server for job status; returns a fresh signed read URL when available. */
export async function getDownloadStatus(jobId: string): Promise<DownloadStatus> {
  const resp = await fetch(`/api/downloads/${encodeURIComponent(jobId)}`)
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    trackEvent('download_status_error', { status: resp.status })
    throw new Error(text || `Status request failed (${resp.status})`)
  }
  const data = await resp.json()
  if (data?.status === 'completed') trackEvent('download_complete', { jobId })
  if (data?.status === 'failed') trackEvent('download_failed', { jobId })
  return data
}
import { trackEvent } from './analytics'
