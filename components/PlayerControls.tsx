
import React from 'react';
import Icon from './Icon';

interface PlayerControlsProps {
  currentVerseIndex: number; // 0-indexed
  totalVerses: number;
  onSeekToVerse: (verseIndex: number) => void;
  onPrevVerseClick: () => void; // New prop
  onNextVerseClick: () => void; // New prop
  disabled: boolean;
}

const PlayerControls: React.FC<PlayerControlsProps> = ({
  currentVerseIndex,
  totalVerses,
  onSeekToVerse,
  onPrevVerseClick,
  onNextVerseClick,
  disabled,
}) => {
  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onSeekToVerse(parseInt(event.target.value, 10));
  };

  if (totalVerses <= 0) {
    return null;
  }

  return (
    <div className="mt-6 p-4 bg-slate-800/80 rounded-lg shadow-md flex flex-col sm:flex-row items-center justify-between backdrop-blur-sm space-y-3 sm:space-y-0 sm:space-x-3">
      <button
        onClick={onPrevVerseClick}
        disabled={disabled || currentVerseIndex === 0 || totalVerses <= 1}
        className="p-2 rounded-full text-slate-300 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous Verse"
      >
        <Icon name="skip-back" weight="bold" size="lg" />
      </button>

      <div className="flex-grow w-full sm:w-auto">
        <label htmlFor="verse-slider" className="sr-only">
          Verse Navigation
        </label>
        <input
          type="range"
          id="verse-slider"
          min="0"
          max={totalVerses > 0 ? totalVerses - 1 : 0}
          value={currentVerseIndex}
          onChange={handleSliderChange}
          disabled={disabled || totalVerses <= 1}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-valuetext={`Verse ${currentVerseIndex + 1} of ${totalVerses}`}
        />
      </div>
      
      <button
        onClick={onNextVerseClick}
        disabled={disabled || currentVerseIndex >= totalVerses - 1 || totalVerses <= 1}
        className="p-2 rounded-full text-slate-300 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Next Verse"
      >
        <Icon name="skip-forward" weight="bold" size="lg" />
      </button>

      <div className="text-slate-300 font-medium text-sm whitespace-nowrap sm:ml-2">
        Verse {currentVerseIndex + 1} of {totalVerses}
      </div>
    </div>
  );
};

export default PlayerControls;
