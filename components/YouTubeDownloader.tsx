import React from 'react'
import { useDownloadJob } from '../hooks/useDownloadJob'
import Icon from './Icon'

type Props = { onAnalyze?: (url: string, opts?: { fileName?: string; mimeType?: string }) => void }

const YouTubeDownloader: React.FC<Props> = ({ onAnalyze }) => {
  const d = useDownloadJob('m4a')

  return (
    <div className="w-full max-w-3xl mx-auto bg-slate-800/60 border border-slate-700 rounded-lg p-4 mb-6">
      <div className="flex items-center mb-3">
        <Icon name="download" weight="bold" className="text-sky-400 mr-2" />
        <h3 className="text-slate-100 font-semibold">Download audio from YouTube</h3>
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
          {d.isStarting ? 'Starting…' : d.isPolling ? 'Working…' : 'Start'}
        </button>
      </div>

      <div className="mt-3 text-sm text-slate-300">
        {d.error && <div className="text-red-400">{d.error}</div>}
        {d.status && (
          <div className="flex flex-col gap-1">
            <div>
              <span className="text-slate-400">Status:</span> <span className="font-mono">{d.status.status}</span>
              {d.status.apifyStatus && (
                <span className="ml-2 text-slate-400">(Apify: <span className="font-mono">{d.status.apifyStatus}</span>)</span>
              )}
            </div>
            {d.status.url && (
              <div className="flex items-center gap-2">
                <a className="text-sky-400 underline" href={d.status.url} target="_blank" rel="noreferrer">Open audio</a>
                <button
                  className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(d.status!.url!) } catch {}
                  }}
                >Copy URL</button>
                <button
                  className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-white"
                  onClick={() => onAnalyze?.(d.status!.url!, { fileName: (d.status.gcsObject?.path?.split('/')?.pop() || 'downloaded-audio'), mimeType: d.status.gcsObject?.contentType })}
                >Analyze in Babelback</button>
                <audio controls className="ml-2 w-full max-w-sm" src={d.status.url} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default YouTubeDownloader
