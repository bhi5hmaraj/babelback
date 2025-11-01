import React, { useEffect, useState } from 'react';
import AudioPlayer from './AudioPlayer';
import PlayerControls from './PlayerControls';

interface PlayerBarProps {
  audioSrc: string | null;
  onTimeUpdate: (currentTime: number) => void;
  setAudioElement: (el: HTMLAudioElement | null) => void;
  onLoadedData?: () => void;
  onDurationAvailable?: (duration: number) => void;
  outputDeviceId?: string | null;

  totalVerses: number;
  currentVerseIndex: number;
  onSeekToVerse: (idx: number) => void;
  onPrevVerseClick: () => void;
  onNextVerseClick: () => void;
  disabled?: boolean;
  compact?: boolean; // reduce padding/margins for mobile
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
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const preferCompact = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        if (preferCompact) setCollapsed(true);
      }
    } catch {}
  }, []);
  return (
    <div className={`w-full bg-slate-900/80 backdrop-blur-md border-t border-slate-700/60 ${compact ? 'p-2' : 'p-3 pt-2'}
                    sticky bottom-0 left-0 z-30 safe-area-inset-b`}>
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-end mb-1">
          <button
            className="text-xs px-2 py-1 rounded bg-slate-800 text-sky-200 hover:bg-slate-700"
            onClick={() => setCollapsed(v => !v)}
          >{collapsed ? 'Expand Player' : 'Minimize Player'}</button>
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
          />)
        }
      </div>
    </div>
  );
};

export default PlayerBar;
