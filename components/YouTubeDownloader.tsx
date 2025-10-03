import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDownloadJob } from '../hooks/useDownloadJob'
import Icon from './Icon'
import { AI_THOUGHTS_AND_JOKES } from '../constants'

type Props = { onAnalyze?: (url: string, opts?: { fileName?: string; mimeType?: string }) => void }

const YouTubeDownloader: React.FC<Props> = ({ onAnalyze }) => {
  const d = useDownloadJob('m4a')

  // Fun spinner messages (similar vibe to Gemini analysis)
  const [funLine, setFunLine] = useState('')
  const timerRef = useRef<number | null>(null)
  const startSpinner = () => {
    setFunLine(AI_THOUGHTS_AND_JOKES[Math.floor(Math.random() * AI_THOUGHTS_AND_JOKES.length)])
    timerRef.current = window.setInterval(() => {
      setFunLine(AI_THOUGHTS_AND_JOKES[Math.floor(Math.random() * AI_THOUGHTS_AND_JOKES.length)])
    }, 3000)
  }
  const stopSpinner = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  useEffect(() => {
    if (d.isStarting || d.isPolling) startSpinner(); else stopSpinner();
    return () => stopSpinner()
  }, [d.isStarting, d.isPolling])

  // Auto-hand off to analysis when completed (no URL exposed in UI)
  useEffect(() => {
    if (d.status?.status === 'completed' && d.status.url && onAnalyze) {
      onAnalyze(d.status.url, { fileName: d.status.gcsObject?.path?.split('/')?.pop(), mimeType: d.status.gcsObject?.contentType })
    }
  }, [d.status?.status])

  const buttonLabel = useMemo(() => {
    if (d.isStarting) return 'Starting…'
    if (d.isPolling) return 'Processing audio…'
    return 'Process Audio'
  }, [d.isStarting, d.isPolling])

  return (
    <div className="w-full max-w-3xl mx-auto bg-slate-800/60 border border-slate-700 rounded-lg p-4 mb-6">
      <div className="flex items-center mb-3">
        <Icon name="download" weight="bold" className="text-sky-400 mr-2" />
        <h3 className="text-slate-100 font-semibold">Process from YouTube</h3>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="flex-1 bg-slate-900/70 border border-slate-700 rounded-md px-3 py-2 text-slate-100 placeholder-slate-500"
          placeholder="Paste YouTube link (https://…)"
          value={d.youtubeUrl}
          onChange={(e) => d.setYoutubeUrl(e.target.value)}
        />
        <select
          className="bg-slate-900/70 border border-slate-700 rounded-md px-3 py-2 text-slate-100"
          value={d.audioFormat}
          onChange={(e) => d.setAudioFormat(e.target.value as 'm4a' | 'mp3')}
        >
          <option value="m4a">m4a (AAC)</option>
          <option value="mp3">mp3</option>
        </select>
        <button
          disabled={d.isStarting || d.isPolling}
          onClick={d.start}
          className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-700 disabled:bg-slate-600 text-white"
        >
          {buttonLabel}
        </button>
      </div>

      {(d.isStarting || d.isPolling) && (
        <div className="mt-3 flex items-center text-slate-300 text-sm">
          <Icon name="spinner-gap" className="animate-spin mr-2" />
          <span>{funLine}</span>
        </div>
      )}

      {d.error && <div className="mt-3 text-sm text-red-400">{d.error}</div>}
    </div>
  )
}

export default YouTubeDownloader
