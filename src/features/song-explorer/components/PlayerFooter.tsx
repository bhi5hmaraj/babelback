import * as React from 'react'
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react'

export interface PlayerFooterProps {
  currentTime: number
  duration: number
  isPlaying: boolean
  onPrev: () => void
  onNext: () => void
  onTogglePlay: () => void
  onSeek: (time: number) => void
  className?: string
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '--:--'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Fixed footer controls shared by mobile + desktop.
 * Uses a native range input to keep tests lightweight.
 */
export function PlayerFooter({
  currentTime,
  duration,
  isPlaying,
  onPrev,
  onNext,
  onTogglePlay,
  onSeek,
  className,
}: PlayerFooterProps) {
  const safeMax = Math.max(1, Number.isFinite(duration) ? duration : 1)
  const safeValue = Math.min(currentTime || 0, safeMax)
  return (
    <section data-testid="player-footer" className={className}>
      <div className="px-5">
        <input
          data-testid="seek"
          type="range"
          min={0}
          max={safeMax}
          step={0.1}
          value={safeValue}
          onChange={(e) => onSeek(Number(e.currentTarget.value))}
          aria-label="Song progress"
          className="w-full"
          style={{
            WebkitAppearance: 'none',
            height: 6,
            borderRadius: 9999,
            background: `linear-gradient(to right, #a67c52 ${(safeValue / safeMax) * 100}%, #d4c8aa ${(safeValue / safeMax) * 100}%)`,
          }}
        />
        <div aria-label="time" className="mt-1.5 flex justify-between text-[11px]" style={{ color: '#7d6b56' }}>
          <span>{formatTime(safeValue)}</span>
          <span>{formatTime(safeMax)}</span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-center gap-4 px-5">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous verse"
          className="h-10 w-10 rounded-full"
          style={{ color: '#4a3f35', background: 'transparent' }}
        >
          <SkipBack className="h-5 w-5 mx-auto" />
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="h-12 w-12 rounded-full shadow-xl"
          style={{ color: '#fff', background: '#a67c52' }}
        >
          {isPlaying ? <Pause className="h-6 w-6 mx-auto" /> : <Play className="h-6 w-6 mx-auto" />}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next verse"
          className="h-10 w-10 rounded-full"
          style={{ color: '#4a3f35', background: 'transparent' }}
        >
          <SkipForward className="h-5 w-5 mx-auto" />
        </button>
      </div>

      <style jsx>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #8d6e4c;
          border: 2px solid #fff;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          margin-top: -4px;
        }
        input[type='range']::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #8d6e4c;
          border: 2px solid #fff;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        input[type='range'] { outline: none; }
      `}</style>
    </section>
  )
}

export default PlayerFooter
