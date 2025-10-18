"use client"

import React from 'react';
import { SingingScore, VerseSingingScore, SongData, Verse } from '../types'; // Added SongData, Verse
import Icon from './Icon';

interface ScoreDisplayProps {
  score: SingingScore | null;
  originalSongData?: SongData | null; // New prop
}

const getScoreColor = (value: number) => {
  if (value >= 80) return 'text-green-400';
  if (value >= 60) return 'text-yellow-400';
  if (value >= 40) return 'text-orange-400';
  return 'text-red-400';
};

const ScoreMetric: React.FC<{label: string, value: number, icon: string, size?: 'small' | 'large'}> = ({label, value, icon, size = 'large'}) => (
   <div className={`bg-slate-700 p-3 rounded-lg text-center ${size === 'small' ? 'transform scale-90' : ''}`}>
      <Icon name={icon} weight="duotone" size={size === 'small' ? 'lg' : 'xl'} className={`mb-1 ${getScoreColor(value)}`} />
      <p className={`text-xs text-slate-400 mb-0.5 ${size === 'small' ? 'text-[10px]' : ''}`}>{label}</p>
      <p className={`font-bold ${getScoreColor(value)} ${size === 'small' ? 'text-lg' : 'text-xl'}`}>{value}<span className="text-xs">/100</span></p>
  </div>
);

const FeedbackList: React.FC<{title: string, items: string[], icon: string, iconColor: string}> = ({ title, items, icon, iconColor }) => (
  <div>
    <h4 className={`text-sm font-semibold ${iconColor} mb-1 flex items-center`}>
      <Icon name={icon} className="mr-2" /> {title}:
    </h4>
    {items && items.length > 0 ? (
      <ul className="list-disc list-inside text-xs text-slate-300 space-y-1 pl-2">
        {items.map((item, index) => <li key={`${title.replace(/\s+/g, '-').toLowerCase()}-${index}`}>{item}</li>)}
      </ul>
    ) : (
      <p className="text-xs text-slate-400 italic">No specific points noted.</p>
    )}
  </div>
);

interface VerseScoreCardProps {
  verseScore: VerseSingingScore;
  referenceTransliteration: string | null; // New prop
}

const VerseScoreCard: React.FC<VerseScoreCardProps> = ({ verseScore, referenceTransliteration }) => {
  return (
    <div className="bg-slate-700/50 p-4 rounded-lg mb-4">
      <h4 className="text-md font-semibold text-purple-300 mb-3">
        Feedback for Verse {verseScore.verseNumber}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <ScoreMetric label="Pronunciation" value={verseScore.pronunciationAccuracyScore} icon="translate" size="small"/>
        <ScoreMetric label="Timing" value={verseScore.timingAlignmentScore} icon="timer" size="small"/>
        <ScoreMetric label="Clarity" value={verseScore.vocalClarityScore} icon="waveform" size="small"/>
      </div>
      
      {referenceTransliteration && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-slate-400 mb-0.5">Reference Lyrics (Verse {verseScore.verseNumber}):</p>
          <p className="text-[11px] italic text-slate-300 bg-slate-600/70 p-1.5 rounded whitespace-pre-wrap">{referenceTransliteration}</p>
        </div>
      )}

      {verseScore.userAttemptTranscription && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 mb-0.5">Your Transcription (Verse {verseScore.verseNumber}):</p>
          <p className="text-[11px] italic text-slate-300 bg-slate-600 p-1.5 rounded whitespace-pre-wrap">"{verseScore.userAttemptTranscription}"</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FeedbackList
          title="What Went Well"
          items={verseScore.feedback.positive}
          icon="thumbs-up"
          iconColor="text-green-400"
        />
        <FeedbackList
          title="Areas to Improve"
          items={verseScore.feedback.improvementAreas}
          icon="lightbulb"
          iconColor="text-yellow-400"
        />
      </div>
    </div>
  );
};


const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ score, originalSongData }) => {
  if (!score) {
    return <div className="text-slate-400">No score available yet.</div>;
  }

  const getOriginalVerseTransliteration = (verseNumber: number): string | null => {
    if (!originalSongData || !originalSongData.verses) return null;
    const originalVerse = originalSongData.verses.find(v => v.verseNumber === verseNumber);
    if (!originalVerse) return null;

    if (originalVerse.transliterationSegments && originalVerse.transliterationSegments.length > 0) {
      return originalVerse.transliterationSegments.map(seg => seg.text).join(' ');
    }
    return originalVerse.transliteration || null;
  };

  return (
    <div className="my-4 p-4 bg-slate-800/70 rounded-lg shadow-md backdrop-blur-sm">
      <h3 className="text-xl font-semibold text-sky-300 mb-4 text-center">Your Performance Feedback</h3>

      {/* Overall Performance Section */}
      <div className="mb-6 p-4 bg-slate-700/70 rounded-lg">
        <h4 className="text-lg font-medium text-center text-sky-200 mb-3">Overall Performance</h4>
        <div className="mb-4 text-center">
          <p className="text-sm text-slate-400">Overall Score</p>
          <p className={`text-5xl font-bold ${getScoreColor(score.overallScore)} my-1`}>
              {score.overallScore}
              <span className="text-2xl">/100</span>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <ScoreMetric label="Pronunciation" value={score.pronunciationAccuracyScore} icon="translate"/>
          <ScoreMetric label="Timing" value={score.timingAlignmentScore} icon="timer"/>
          <ScoreMetric label="Clarity" value={score.vocalClarityScore} icon="waveform"/>
        </div>
        {score.userAttemptTranscription && (
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-300 mb-1">AI's Transcription (Overall/Key Segment):</p>
            <p className="text-xs italic text-slate-400 bg-slate-600 p-2 rounded whitespace-pre-wrap">"{score.userAttemptTranscription}"</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FeedbackList
            title="Overall Positives"
            items={score.feedback.positive}
            icon="thumbs-up"
            iconColor="text-green-300"
          />
          <FeedbackList
            title="Overall Improvement Areas"
            items={score.feedback.improvementAreas}
            icon="lightbulb"
            iconColor="text-yellow-300"
          />
        </div>
      </div>

      {/* Verse-by-Verse Breakdown Section */}
      {score.verseScores && score.verseScores.length > 0 && (
        <div className="mt-8">
          <h4 className="text-lg font-semibold text-sky-300 mb-4 text-center border-t border-slate-700 pt-4">
            Verse-by-Verse Breakdown
          </h4>
          {score.verseScores.map((vs, index) => {
            const refTranslit = getOriginalVerseTransliteration(vs.verseNumber);
            return (
              <VerseScoreCard 
                key={`verse-score-${vs.verseNumber}-${index}`} 
                verseScore={vs} 
                referenceTransliteration={refTranslit}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ScoreDisplay;
