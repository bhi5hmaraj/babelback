import React from 'react';
import { LibraryEntry } from '../types';
import Icon from './Icon';

interface LibraryViewProps {
  entries: LibraryEntry[];
  onLoadSong: (entry: LibraryEntry) => void;
  onDeleteSong: (id: number) => void;
}

const LibraryView: React.FC<LibraryViewProps> = ({ entries, onLoadSong, onDeleteSong }) => {
  if (entries.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <Icon name="books" weight="duotone" size="3xl" className="mb-3 text-sky-400" />
        <p className="text-lg">Your song library is empty.</p>
        <p className="text-sm">Processed songs will appear here for quick access.</p>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatSecondsToMMSS = (totalSeconds: number | undefined): string => {
    if (typeof totalSeconds !== 'number' || isNaN(totalSeconds) || totalSeconds < 0) return 'N/A';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div className="py-6">
      <h2 className="text-2xl font-semibold text-sky-300 mb-6 text-center">My Song Library</h2>
      <div className="space-y-4">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="bg-slate-700/80 p-4 rounded-lg shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center hover:bg-slate-600/80 transition-colors"
          >
            <div className="mb-3 sm:mb-0 flex-grow">
              <h3 className="text-lg font-semibold text-slate-100">{entry.title}</h3>
              <p className="text-xs text-slate-400">
                Original: {entry.originalLanguage} | Target: {entry.targetLanguage}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Added: {formatDate(entry.timestamp)}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span className="text-sky-300">
                  <Icon name="timer" weight="bold" className="mr-1" />
                  Duration: {formatSecondsToMMSS(entry.songDurationSeconds)}
                </span>
                <span className="text-purple-300">
                  <Icon name="hourglass-medium" weight="bold" className="mr-1" />
                  AI Time: {entry.processingTimeSeconds ? `${entry.processingTimeSeconds.toFixed(1)}s` : 'N/A'}
                </span>
              </div>
            </div>
            <div className="flex space-x-2 flex-shrink-0 self-start sm:self-center mt-2 sm:mt-0">
              <button
                onClick={() => onLoadSong(entry)}
                className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm flex items-center"
                aria-label={`Load ${entry.title}`}
              >
                <Icon name="play-circle" weight="bold" className="mr-2" /> Load
              </button>
              <button
                onClick={() => onDeleteSong(entry.id)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm flex items-center"
                aria-label={`Delete ${entry.title}`}
              >
                <Icon name="trash" weight="bold" className="mr-2" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LibraryView;