"use client"

import type React from "react"
import { useState } from "react"
import AudioPlayer from "./AudioPlayer"
import PlayerControls from "./PlayerControls"

interface PlayerBarProps {
  audioSrc: string | null
  onTimeUpdate: (currentTime: number) => void
  setAudioElement: (el: HTMLAudioElement | null) => void
  onLoadedData?: () => void
  onDurationAvailable?: (duration: number) => void
  outputDeviceId?: string | null

  totalVerses: number
  currentVerseIndex: number
  onSeekToVerse: (idx: number) => void
  onPrevVerseClick: () => void
  onNextVerseClick: () => void
  disabled?: boolean
  compact?: boolean
}

/**
 * Sticky bottom playback bar containing the audio element and verse navigation.
 * Safe-area aware; optimized for mobile usage.
 */
const PlayerBar: React.FC<PlayerBarProps> = ({
  audioSrc,
  onTimeUpdate,
  setAudioElement,
  onLoadedData,
  onDurationAvailable,
  outputDeviceId,
  totalVerses,
  currentVerseIndex,
  onSeekToVerse,
  onPrevVerseClick,
  onNextVerseClick,
  disabled,
  compact,
}) => {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div
      className={`w-full bg-foreground/98 backdrop-blur-lg border-t border-border-accent shadow-2xl
                    ${compact ? "p-2" : "p-3 pt-2"}
                    fixed bottom-0 left-0 right-0 z-50`}
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-end mb-1">
          <button
            className="text-xs px-3 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary-dark transition-colors font-medium"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand player controls" : "Minimize player controls"}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {collapsed ? "▲ Show Controls" : "▼ Hide Controls"}
          </button>
        </div>
        <AudioPlayer
          src={audioSrc}
          onTimeUpdate={onTimeUpdate}
          setAudioElement={setAudioElement}
          onLoadedData={onLoadedData}
          onDurationAvailable={onDurationAvailable}
          outputDeviceId={outputDeviceId}
          compact={compact}
        />
        {!collapsed && totalVerses > 0 && (
          <PlayerControls
            currentVerseIndex={currentVerseIndex}
            totalVerses={totalVerses}
            onSeekToVerse={onSeekToVerse}
            onPrevVerseClick={onPrevVerseClick}
            onNextVerseClick={onNextVerseClick}
            disabled={!!disabled || !audioSrc}
            compact={compact}
          />
        )}
      </div>
    </div>
  )
}

export default PlayerBar
