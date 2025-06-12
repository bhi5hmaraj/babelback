
import React from 'react';
import { Verse, PanelVisibility, TransliterationSegment, TranslationSegment } from '../types';
import Icon from './Icon';

interface VerseDisplayCardProps {
  title: string;
  content: string | React.ReactNode;
  language?: string;
  isVisible: boolean;
  iconName?: string;
  iconColorClass?: string;
}

const VerseDisplayCard: React.FC<VerseDisplayCardProps> = ({ title, content, language, isVisible, iconName, iconColorClass = "text-sky-400" }) => {
  if (!isVisible) return null;

  return (
    <div className="bg-slate-800 p-4 rounded-lg shadow-lg mb-4 transition-all duration-300 ease-in-out">
      <h3 className={`text-sm font-semibold ${iconColorClass} mb-1 tracking-wide flex items-center`}>
        {iconName && <Icon name={iconName} weight="bold" className="mr-2" />}
        {title} {language && <span className="text-xs text-slate-400">({language})</span>}
      </h3>
      {typeof content === 'string' ? (
        <p className="text-slate-200 whitespace-pre-wrap leading-relaxed text-base">{content || "N/A"}</p>
      ) : (
        <div className="text-slate-200 leading-relaxed text-base">{content || "N/A"}</div>
      )}
    </div>
  );
};

interface VerseDisplayProps {
  verse: Verse;
  targetLanguage: string;
  originalLanguageLabel: string;
  panelVisibility: PanelVisibility;
  currentTime: number;
  isKaraokeMode: boolean;
}

const VerseDisplay: React.FC<VerseDisplayProps> = ({ 
  verse, 
  targetLanguage, 
  originalLanguageLabel, 
  panelVisibility,
  currentTime,
  isKaraokeMode 
}) => {
  if (!verse) {
    return <div className="text-center text-slate-400 py-8">No verse data available.</div>;
  }

  const renderSegments = (
    segments: TransliterationSegment[] | TranslationSegment[] | undefined, 
    activeSegmentClassSuffix: string // e.g., 'active-translit-segment'
  ) => {
    if (!segments || segments.length === 0) return null;
    
    const baseSegmentClass = activeSegmentClassSuffix.includes('translit') ? 'translit-segment' : 'translation-segment';

    return (
      <>
        {segments.map((segment, index) => {
          const isActive = currentTime >= segment.startTime && currentTime < segment.endTime;
          const words = segment.text.split(' ').filter(word => word.length > 0);

          return (
            <div // Use div for block-level segment container
              key={`${baseSegmentClass}-phrase-${index}`}
              className={`${baseSegmentClass} ${isActive ? activeSegmentClassSuffix : ''}`}
              aria-current={isActive ? "time" : undefined}
            >
              {words.map((word, wordIndex) => (
                <span
                  key={`word-${index}-${wordIndex}`}
                  className="lyric-word"
                >
                  {word}
                </span>
              ))}
              {words.length === 0 && segment.text.trim() === "" && (
                 <span className="lyric-word">&nbsp;</span> // Placeholder for empty segments
              )}
            </div>
          );
        })}
      </>
    );
  };

  const isInstrumentalSong = originalLanguageLabel === "Instrumental";

  let transliterationDisplayContent;
  if (isKaraokeMode && verse.transliterationSegments && verse.transliterationSegments.length > 0) {
    transliterationDisplayContent = renderSegments(verse.transliterationSegments, 'active-translit-segment');
  } else if (isInstrumentalSong && (!verse.transliteration || verse.transliteration.trim() === "")) {
    transliterationDisplayContent = verse.original || "Instrumental Section";
  } else {
    transliterationDisplayContent = verse.transliteration || "Transliteration not available.";
  }

  let translationDisplayContent;
  if (isKaraokeMode && verse.translationSegments && verse.translationSegments.length > 0) {
    translationDisplayContent = renderSegments(verse.translationSegments, 'active-translation-segment');
  } else if (isInstrumentalSong && (!verse.translation || verse.translation.trim() === "")) {
    translationDisplayContent = verse.original || "Instrumental Section"; 
  } else {
    translationDisplayContent = verse.translation || "Translation not available.";
  }


  return (
    <div className="bg-slate-800/60 p-5 md:p-6 rounded-xl shadow-xl backdrop-blur-sm">
      <h2 className="text-xl md:text-2xl font-bold text-slate-100 mb-1">
        Verse {verse.verseNumber}
      </h2>
      <p className="text-xs text-slate-400 mb-4">
        Original Lyrics Language: {originalLanguageLabel} | Timings: {new Date(verse.startTime * 1000).toISOString().substr(14, 5)} - {new Date(verse.endTime * 1000).toISOString().substr(14, 5)}
      </p>
      <div className="border-b border-slate-700 mb-4"></div>
      
      {panelVisibility.lyrics && (
        <div className="bg-slate-800 p-4 rounded-lg shadow-lg mb-4">
          <h3 className="text-sm font-semibold text-sky-400 mb-3 tracking-wide flex items-center">
            <Icon name={isKaraokeMode ? "microphone-stage" : "translate"} weight="bold" className="mr-2" />
            {isKaraokeMode ? "Synced Lyrics" : "Lyrics"}
             <span className="text-xs text-slate-400 ml-1"> (to {targetLanguage})</span>
          </h3>
          <div className="flex flex-col md:flex-row gap-4 md:gap-6">
            {/* Transliteration Column */}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-medium text-purple-300 mb-2">Transliteration (of Original in {targetLanguage} Script)</h4>
              <div className="rounded-md min-h-[60px]">
                {typeof transliterationDisplayContent === 'string' ? (
                  isInstrumentalSong && transliterationDisplayContent.includes("Instrumental") ? (
                     <div className="translit-segment"><span className="lyric-word">{transliterationDisplayContent}</span></div>
                  ) : transliterationDisplayContent.split('\n').map((line, lineIdx) => (
                    <div key={`tlit-line-${lineIdx}`} className="translit-segment">
                      {line.split(' ').filter(w => w.length > 0).map((word, wordIdx) => (
                        <span key={`tlit-word-${lineIdx}-${wordIdx}`} className="lyric-word">
                          {word}
                        </span>
                      ))}
                       {line.trim() === "" && line.split(' ').filter(w => w.length > 0).length === 0 && <span className="lyric-word">&nbsp;</span>}
                    </div>
                  ))
                ) : (
                  transliterationDisplayContent
                )}
              </div>
            </div>
            {/* Translation Column */}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-medium text-indigo-300 mb-2">Translation (to {targetLanguage})</h4>
              <div className="rounded-md min-h-[60px]">
                {typeof translationDisplayContent === 'string' ? (
                   isInstrumentalSong && translationDisplayContent.includes("Instrumental") ? (
                     <div className="translation-segment"><span className="lyric-word">{translationDisplayContent}</span></div>
                   ) : translationDisplayContent.split('\n').map((line, lineIdx) => (
                    <div key={`tlat-line-${lineIdx}`} className="translation-segment">
                      {line.split(' ').filter(w => w.length > 0).map((word, wordIdx) => (
                        <span key={`tlat-word-${lineIdx}-${wordIdx}`} className="lyric-word">
                          {word}
                        </span>
                      ))}
                      {line.trim() === "" && line.split(' ').filter(w => w.length > 0).length === 0 && <span className="lyric-word">&nbsp;</span>}
                    </div>
                  ))
                ) : (
                  translationDisplayContent
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <VerseDisplayCard 
        title="Meaning & Context" 
        content={verse.meaning} 
        language={targetLanguage}
        isVisible={panelVisibility.meaning}
        iconName="lightbulb"
        iconColorClass="text-yellow-400"
      />
    </div>
  );
};

export default VerseDisplay;