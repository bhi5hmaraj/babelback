export type StartDownloadResponse = {
  jobId: string
  statusUrl: string
  getUrl?: string
  apifyRunId?: string
}

export type DownloadStatus = {
  id: string
  status: 'queued' | 'working' | 'completed' | 'failed' | 'unknown'
  url?: string
  gcsObject?: { bucket: string; path: string; contentType?: string; size?: number }
  error?: { message: string }
  apifyRunId?: string
  apifyStatus?: string
}

export async function startDownload(youtubeUrl: string, audioFormat: 'm4a' | 'mp3' = 'm4a', country = 'IN'): Promise<StartDownloadResponse> {
  const resp = await fetch('/api/downloads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ youtubeUrl, audioFormat, country })
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(text || `Failed to start download (${resp.status})`)
  }
  return await resp.json()
}

export async function getDownloadStatus(jobId: string): Promise<DownloadStatus> {
  const resp = await fetch(`/api/downloads/${encodeURIComponent(jobId)}`)
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(text || `Status request failed (${resp.status})`)
  }
  return await resp.json()
}
