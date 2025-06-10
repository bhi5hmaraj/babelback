
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
        <div className="text-slate-200 whitespace-pre-wrap leading-relaxed text-base">{content || "N/A"}</div>
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
    activeSegmentClass: string,
    baseSegmentClass: string = 'text-slate-300' // Default color for inactive segments
  ) => {
    if (!segments || segments.length === 0) return null;
    return (
      <div>
        {segments.map((segment, index) => {
          const isActive = currentTime >= segment.startTime && currentTime < segment.endTime;
          // Reverted: Content is always segment.text. Highlighting is done by class.
          const content = segment.text; 

          return (
            <span
              key={index}
              className={`${baseSegmentClass} ${isActive ? activeSegmentClass : ''} ${activeSegmentClass.includes('translit') ? 'translit-segment' : 'translation-segment'}`}
              aria-current={isActive ? "time" : undefined}
            >
              {content}
            </span>
          );
        })}
      </div>
    );
  };

  const isInstrumentalSong = originalLanguageLabel === "Instrumental";

  let transliterationDisplayContent;
  if (isKaraokeMode && verse.transliterationSegments && verse.transliterationSegments.length > 0) {
    transliterationDisplayContent = renderSegments(verse.transliterationSegments, 'active-translit-segment', 'text-slate-100');
  } else if (isInstrumentalSong && (!verse.transliteration || verse.transliteration.trim() === "")) {
    transliterationDisplayContent = verse.original || "Instrumental Section";
  } else {
    transliterationDisplayContent = verse.transliteration || "Transliteration not available.";
  }

  let translationDisplayContent;
  if (isKaraokeMode && verse.translationSegments && verse.translationSegments.length > 0) {
    translationDisplayContent = renderSegments(verse.translationSegments, 'active-translation-segment', 'text-slate-300');
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
            <div className="flex-1 min-w-0"> {/* Transliteration Column */}
              <h4 className="text-xs font-medium text-purple-300 mb-1">Transliteration (of Original in {targetLanguage} Script)</h4>
              <div className="text-slate-200 whitespace-pre-wrap leading-relaxed text-base p-3 bg-slate-700/50 rounded-md min-h-[60px]">
                {transliterationDisplayContent}
              </div>
            </div>
            <div className="flex-1 min-w-0"> {/* Translation Column */}
              <h4 className="text-xs font-medium text-indigo-300 mb-1">Translation (to {targetLanguage})</h4>
              <div className="text-slate-200 whitespace-pre-wrap leading-relaxed text-base p-3 bg-slate-700/50 rounded-md min-h-[60px]">
                {translationDisplayContent}
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
