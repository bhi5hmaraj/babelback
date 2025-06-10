
import React, { useState, useEffect } from 'react';
import { Verse, PracticeModeStatus, SingingScore, TransliterationSegment, SongData } from '../types'; // Added SongData
import Icon from './Icon'; 
import LoadingSpinner from './LoadingSpinner';
import ScoreDisplay from './ScoreDisplay';

interface PracticeVersePanelProps {
  practiceTargetVerses: Verse[]; 
  status: PracticeModeStatus;
  score: SingingScore | null;
  error: string | null;
  recordedAudioUrl: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTryAgain: () => void; // Re-record current attempt
  onSubmitForScoring: () => void; // New: submit after review
  onExit: () => void;
  currentTimeForHighlight: number; 
  isKaraokeModeEnabled: boolean;  
  recordingFormattedTime: string;
  originalSongDataForDisplay: SongData | null; // New prop
}

const PracticeVersePanel: React.FC<PracticeVersePanelProps> = ({
  practiceTargetVerses,
  status,
  score,
  error,
  recordedAudioUrl,
  onStartRecording,
  onStopRecording,
  onTryAgain,
  onSubmitForScoring, 
  onExit,
  currentTimeForHighlight,
  isKaraokeModeEnabled,
  recordingFormattedTime,
  originalSongDataForDisplay, // New prop
}) => {

  const getPanelTitle = () => {
    if (!practiceTargetVerses || practiceTargetVerses.length === 0) return "Practice Mode";
    if (practiceTargetVerses.length === 1) return `Practice: Verse ${practiceTargetVerses[0].verseNumber}`;
    const firstVerseNum = practiceTargetVerses[0].verseNumber;
    const lastVerseNum = practiceTargetVerses[practiceTargetVerses.length - 1].verseNumber;
    if (firstVerseNum === lastVerseNum) return `Practice: Verse ${firstVerseNum}`;
    return `Practice: Verses ${firstVerseNum}-${lastVerseNum}`;
  };
  
  const renderTransliterationForPractice = () => {
    if (!practiceTargetVerses || practiceTargetVerses.length === 0) {
      return <p className="text-slate-100 text-base leading-relaxed">Transliteration not available for practice.</p>;
    }

    return (
      <div>
        {practiceTargetVerses.map((verse, verseIdx) => {
          const canUseSegmentsForThisVerse = isKaraokeModeEnabled && verse.transliterationSegments && verse.transliterationSegments.length > 0;
          return (
            <div key={`practice-verse-${verse.verseNumber || verseIdx}`} className={practiceTargetVerses.length > 1 ? 'mb-3 pb-2 border-b border-slate-700 last:border-b-0 last:pb-0 last:mb-0' : ''}>
              {practiceTargetVerses.length > 1 && (
                <p className="text-xs text-purple-300 font-semibold mb-1">Verse {verse.verseNumber}:</p>
              )}
              {canUseSegmentsForThisVerse ? (
                verse.transliterationSegments!.map((segment, segIdx) => {
                  // Highlight only if currently recording/playing back song, not for static review display
                  const isActive = (status === PracticeModeStatus.RECORDING) && 
                                   currentTimeForHighlight >= segment.startTime && 
                                   currentTimeForHighlight < segment.endTime;
                  return (
                    <span
                      key={`practice-seg-${verse.verseNumber}-${segIdx}`}
                      className={`text-slate-100 ${isActive ? 'active-translit-segment' : ''} translit-segment`}
                      aria-current={isActive ? "time" : undefined}
                    >
                      {segment.text}
                    </span>
                  );
                })
              ) : (
                <p className="text-slate-100 text-base leading-relaxed whitespace-pre-wrap">
                  {verse.transliteration || `(Verse ${verse.verseNumber} transliteration not available)`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };


  return (
    <div className="my-6 p-4 md:p-6 bg-slate-700/70 rounded-xl shadow-xl backdrop-blur-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-sky-300">
          {getPanelTitle()}
        </h3>
        <button 
          onClick={onExit} 
          className="text-xs text-slate-400 hover:text-sky-400 transition-colors"
          disabled={status === PracticeModeStatus.SCORING || status === PracticeModeStatus.PROCESSING_AUDIO}
        >
          <Icon name="x-circle" className="mr-1" /> Exit Practice
        </button>
      </div>

      <div className="mb-4 p-3 bg-slate-800 rounded-md max-h-60 overflow-y-auto">
        <p className="text-sm text-slate-400 mb-1">
          {status === PracticeModeStatus.AWAITING_REVIEW ? "Review your recording for these lyrics:" : "Sing these lyrics (transliteration):"}
        </p>
        <div className="text-slate-100 text-base leading-relaxed">
            {renderTransliterationForPractice()}
        </div>
      </div>

      {status === PracticeModeStatus.READY_TO_RECORD && (
        <button
          onClick={onStartRecording}
          className="w-full px-6 py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-colors duration-150 flex items-center justify-center text-lg"
        >
          <Icon name="microphone" weight="bold" className="mr-2" /> Start Recording
        </button>
      )}

      {status === PracticeModeStatus.RECORDING && (
        <div className="text-center">
            <button
            onClick={onStopRecording}
            className="w-full px-6 py-3 bg-sky-600 text-white rounded-lg shadow-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 transition-colors duration-150 flex items-center justify-center text-lg"
            >
            <Icon name="stop-circle" weight="bold" className="mr-2" /> Stop Recording
            </button>
            <p className="text-sm text-red-400 animate-pulse mt-2">
                <Icon name="record" weight="fill" className="text-red-500 inline-block mr-1" /> Recording: {recordingFormattedTime}
            </p>
        </div>
      )}

      {status === PracticeModeStatus.AWAITING_REVIEW && (
        <div className="my-4">
          <p className="text-sm text-slate-300 mb-2 text-center">Listen to your recording:</p>
          {recordedAudioUrl && (
            <audio controls src={recordedAudioUrl} className="w-full h-10 mb-4" style={{ filter: 'invert(80%) sepia(10%) saturate(200%) hue-rotate(160deg)' }}/>
          )}
          <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-3">
            <button
              onClick={onTryAgain}
              className="px-5 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-sm flex items-center justify-center"
            >
              <Icon name="arrow-clockwise" className="mr-2" /> Re-record
            </button>
            <button
              onClick={onSubmitForScoring}
              className="px-5 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors text-sm flex items-center justify-center"
            >
              <Icon name="paper-plane-tilt" className="mr-2" /> Send for AI Review
            </button>
          </div>
        </div>
      )}

      {(status === PracticeModeStatus.PROCESSING_AUDIO || status === PracticeModeStatus.SCORING) && (
        <LoadingSpinner message={status === PracticeModeStatus.SCORING ? "AI is analyzing your performance..." : "Processing audio..."} />
      )}

      {status === PracticeModeStatus.SHOWING_SCORE && score && (
        <>
          {recordedAudioUrl && (
            <div className="my-4">
              <p className="text-xs text-slate-400 mb-1">Your Recording:</p>
              <audio controls src={recordedAudioUrl} className="w-full h-10" style={{ filter: 'invert(80%) sepia(10%) saturate(200%) hue-rotate(160deg)' }}/>
            </div>
          )}
          <ScoreDisplay score={score} originalSongData={originalSongDataForDisplay} />
        </>
      )}
      
      {status === PracticeModeStatus.ERROR && error && (
        <div className="my-4 p-3 bg-red-800/80 border border-red-600 text-red-100 rounded-lg text-sm">
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}

      {(status === PracticeModeStatus.SHOWING_SCORE || status === PracticeModeStatus.ERROR) && (
        // Don't show this Try Again if already in review (handled by the condition excluding AWAITING_REVIEW implicitly)
        <div className="mt-6 flex justify-center">
          <button
            onClick={onTryAgain} // This "Try Again" means re-record the same verses
            className="px-5 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors text-sm flex items-center"
          >
            <Icon name="arrow-clockwise" className="mr-2" /> Try Again
          </button>
        </div>
      )}
    </div>
  );
};

export default PracticeVersePanel;
