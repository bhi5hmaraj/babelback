
import React, { useState, useEffect, useCallback } from 'react';
import { LibraryEntry, PracticeAttempt, SingingScore, Language } from '../types';
import Icon from './Icon';
import { getPracticeAttemptsForSongFromDB, deletePracticeAttemptFromDB } from '../db';
import ScoreDisplay from './ScoreDisplay'; // For showing detailed score in a modal
import LoadingSpinner from './LoadingSpinner';

interface LibraryViewProps {
  entries: LibraryEntry[];
  onLoadSong: (entry: LibraryEntry) => void;
  onDeleteSong: (id: number) => void;
  currentPlayingLibraryId: number | null;
}

interface PracticeAttemptItemProps {
  attempt: PracticeAttempt;
  onDelete: (attemptId: number) => void;
  onViewScore: (score: SingingScore, songTitle: string) => void;
  originalSongTitle: string;
}

const PracticeAttemptAudioPlayer: React.FC<{blob: Blob}> = ({blob}) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  if(!audioUrl) return null;

  return <audio controls src={audioUrl} className="w-full h-10 my-1" style={{ filter: 'invert(80%) sepia(10%) saturate(200%) hue-rotate(160deg)' }} />;
};

const PracticeAttemptItem: React.FC<PracticeAttemptItemProps> = React.memo(({ attempt, onDelete, onViewScore, originalSongTitle }) => {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
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
    <div className="bg-slate-600/50 p-3 rounded-md mb-3 transition-shadow hover:shadow-lg">
      <div className="flex justify-between items-start mb-1">
        <div>
          <p className="text-xs text-slate-300">
            <Icon name="calendar-blank" className="mr-1.5" />{formatDate(attempt.timestamp)}
          </p>
          <p className="text-xs text-slate-400">
            <Icon name="translate" className="mr-1.5" />Language: {attempt.targetLanguage}
          </p>
        </div>
        <button
            onClick={() => onDelete(attempt.id)}
            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-700/50 rounded-full transition-colors"
            aria-label="Delete this practice attempt"
        >
            <Icon name="trash" size="sm" />
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-1">
        <Icon name="list-numbers" className="mr-1.5" />Practiced Verses: {attempt.practicedVerseNumbers.join(', ') || 'N/A'}
      </p>
      <p className="text-xs text-slate-400 mb-2">
        <Icon name="microphone-stage" className="mr-1.5" />Overall Score: <span className="font-semibold text-sky-300">{attempt.singingScore.overallScore}/100</span>
      </p>
      <p className="text-xs text-slate-400 mb-1">
        <Icon name="timer" className="mr-1.5" />Recording Duration: {formatSecondsToMMSS(attempt.recordingDurationSeconds)}
      </p>
      
      <PracticeAttemptAudioPlayer blob={attempt.userAudioBlob} />

      <button
        onClick={() => onViewScore(attempt.singingScore, originalSongTitle)}
        className="mt-1 w-full text-xs px-3 py-1.5 bg-sky-700 text-sky-200 rounded hover:bg-sky-600 transition-colors flex items-center justify-center"
      >
        <Icon name="chart-bar" className="mr-1.5" /> View Detailed Score
      </button>
    </div>
  );
});

const LibraryView: React.FC<LibraryViewProps> = ({ entries, onLoadSong, onDeleteSong, currentPlayingLibraryId }) => {
  const [practiceHistories, setPracticeHistories] = useState<Record<number, PracticeAttempt[]>>({});
  const [isLoadingHistory, setIsLoadingHistory] = useState<Record<number, boolean>>({});
  const [expandedHistories, setExpandedHistories] = useState<Record<number, boolean>>({});
  
  const [selectedScore, setSelectedScore] = useState<SingingScore | null>(null);
  const [selectedScoreSongTitle, setSelectedScoreSongTitle] = useState<string>("");

  const toggleHistoryExpansion = async (entryId: number) => {
    const isCurrentlyExpanded = expandedHistories[entryId];
    if (!isCurrentlyExpanded && !practiceHistories[entryId]) { // If not expanded and not yet fetched
      setIsLoadingHistory(prev => ({ ...prev, [entryId]: true }));
      try {
        const attempts = await getPracticeAttemptsForSongFromDB(entryId);
        setPracticeHistories(prev => ({ ...prev, [entryId]: attempts }));
      } catch (error) {
        console.error("Failed to load practice history for song " + entryId, error);
        // Optionally set an error state per song
      } finally {
        setIsLoadingHistory(prev => ({ ...prev, [entryId]: false }));
      }
    }
    setExpandedHistories(prev => ({ ...prev, [entryId]: !isCurrentlyExpanded }));
  };

  const handleDeletePracticeAttempt = async (songId: number, attemptId: number) => {
    if (window.confirm("Delete this practice recording? This action cannot be undone.")) {
      try {
        await deletePracticeAttemptFromDB(attemptId);
        // Refresh history for this song
        const updatedAttempts = await getPracticeAttemptsForSongFromDB(songId);
        setPracticeHistories(prev => ({ ...prev, [songId]: updatedAttempts }));
      } catch (error) {
        console.error("Failed to delete practice attempt " + attemptId, error);
        alert("Error deleting practice attempt. Please try again.");
      }
    }
  };

  const handleViewScore = (score: SingingScore, songTitle: string) => {
    setSelectedScore(score);
    setSelectedScoreSongTitle(songTitle);
  };
  
  const closeScoreModal = () => {
    setSelectedScore(null);
    setSelectedScoreSongTitle("");
  };

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
            className={`bg-slate-700/80 p-4 rounded-lg shadow-lg transition-all duration-300 ease-in-out ${currentPlayingLibraryId === entry.id ? 'ring-2 ring-sky-500 shadow-sky-500/30' : 'hover:bg-slate-600/80'}`}
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
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
            {/* Practice History Section */}
            <div className="mt-4 border-t border-slate-600 pt-3">
              <button
                onClick={() => toggleHistoryExpansion(entry.id)}
                className="text-sm text-purple-300 hover:text-purple-200 flex items-center w-full text-left mb-2"
                aria-expanded={!!expandedHistories[entry.id]}
              >
                <Icon name={expandedHistories[entry.id] ? "caret-down" : "caret-right"} weight="bold" className="mr-2" />
                Practice History ({practiceHistories[entry.id]?.length || 0})
                {isLoadingHistory[entry.id] && <Icon name="spinner-gap" className="animate-spin ml-2" />}
              </button>
              {expandedHistories[entry.id] && !isLoadingHistory[entry.id] && (
                <div className="pl-4 max-h-60 overflow-y-auto pr-1">
                  {practiceHistories[entry.id] && practiceHistories[entry.id]!.length > 0 ? (
                    practiceHistories[entry.id]!.map(attempt => (
                      <PracticeAttemptItem 
                        key={attempt.id} 
                        attempt={attempt} 
                        onDelete={(attemptId) => handleDeletePracticeAttempt(entry.id, attemptId)}
                        onViewScore={handleViewScore}
                        originalSongTitle={entry.title}
                      />
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No practice attempts recorded for this song yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal for Detailed Score Display */}
      {selectedScore && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 p-4 md:p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-bold text-sky-300">Practice Score Details</h2>
                <button onClick={closeScoreModal} className="text-slate-400 hover:text-sky-300">
                    <Icon name="x-circle" size="lg" />
                </button>
            </div>
            <p className="text-sm text-slate-300 mb-3">Song: <span className="font-semibold">{selectedScoreSongTitle}</span></p>
            <ScoreDisplay score={selectedScore} originalSongData={null} /> {/* We don't pass originalSongData here as it's complex to retrieve for modal, focus on score */}
          </div>
        </div>
      )}

    </div>
  );
};

export default LibraryView;
