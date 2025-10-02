import { useCallback, useEffect, useRef, useState } from 'react'
import { startDownload, getDownloadStatus, type DownloadStatus } from '../services/downloadsService'

export type UseDownloadJob = {
  youtubeUrl: string
  setYoutubeUrl: (v: string) => void
  audioFormat: 'm4a' | 'mp3'
  setAudioFormat: (v: 'm4a' | 'mp3') => void
  jobId?: string
  status?: DownloadStatus
  isStarting: boolean
  isPolling: boolean
  error?: string
  start: () => Promise<void>
  stop: () => void
}

export function useDownloadJob(initialFormat: 'm4a' | 'mp3' = 'm4a'): UseDownloadJob {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [audioFormat, setAudioFormat] = useState<'m4a' | 'mp3'>(initialFormat)
  const [jobId, setJobId] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<DownloadStatus | undefined>(undefined)
  const [isStarting, setIsStarting] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setIsPolling(false)
  }, [])

  useEffect(() => () => stop(), [stop])

  const poll = useCallback(async (id: string) => {
    try {
      const s = await getDownloadStatus(id)
      setStatus(s)
      if (s.status === 'completed' || s.status === 'failed') {
        stop()
        return
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      // keep polling; transient errors are common
    }
    timerRef.current = setTimeout(() => poll(id), 2000)
  }, [stop])

  const start = useCallback(async () => {
    setError(undefined)
    setStatus(undefined)
    setJobId(undefined)
    stop()
    if (!youtubeUrl || !/^https?:\/\//i.test(youtubeUrl)) {
      setError('Enter a valid YouTube URL')
      return
    }
    setIsStarting(true)
    try {
      const resp = await startDownload(youtubeUrl.trim(), audioFormat)
      setJobId(resp.jobId)
      setStatus({ id: resp.jobId, status: 'queued', url: resp.getUrl, apifyRunId: resp.apifyRunId })
      setIsPolling(true)
      poll(resp.jobId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsStarting(false)
    }
  }, [audioFormat, poll, stop, youtubeUrl])

  return { youtubeUrl, setYoutubeUrl, audioFormat, setAudioFormat, jobId, status, isStarting, isPolling, error, start, stop }
}

