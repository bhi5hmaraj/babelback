import React from 'react'

type Props = {
  youtubeUrl: string
  setYoutubeUrl: (v: string) => void
  audioFormat: 'm4a' | 'mp3'
  setAudioFormat: (v: 'm4a' | 'mp3') => void
}

const YouTubeInput: React.FC<Props> = ({ youtubeUrl, setYoutubeUrl, audioFormat, setAudioFormat }) => {
  return (
    <div className="w-full max-w-3xl mx-auto bg-slate-800/60 border border-slate-700 rounded-lg p-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="flex-1 bg-slate-900/70 border border-slate-700 rounded-md px-3 py-2 text-slate-100 placeholder-slate-500"
          placeholder="Paste YouTube link (https://…)"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
        />
        <select
          className="bg-slate-900/70 border border-slate-700 rounded-md px-3 py-2 text-slate-100"
          value={audioFormat}
          onChange={(e) => setAudioFormat(e.target.value as 'm4a' | 'mp3')}
        >
          <option value="m4a">m4a (AAC)</option>
          <option value="mp3">mp3</option>
        </select>
      </div>
    </div>
  )
}

export default YouTubeInput

