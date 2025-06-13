
import React, { useRef, useEffect } from 'react';
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
    <div className="bg-slate-800 p-4 rounded-lg shadow-lg mt-4 transition-all duration-300 ease-in-out">
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

const renderWords = (lineText: string) => {
  if (!lineText || lineText.trim() === "") {
    return <span className="lyric-word">&nbsp;</span>; // Placeholder for empty lines
  }
  const words = lineText.split(' ').filter(word => word.length > 0);
  if (words.length === 0 && lineText.trim() !== "") { // Line has content but it's all spaces
     return <span className="lyric-word">{lineText}</span>; // Render the spaces as a single "word"
  }
  return words.map((word, wordIndex) => (
    <span key={`word-${wordIndex}`} className="lyric-word">
      {word}
    </span>
  ));
};


const VerseDisplay: React.FC<VerseDisplayProps> = ({
  verse,
  targetLanguage,
  originalLanguageLabel,
  panelVisibility,
  currentTime,
  isKaraokeMode
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeLinePairRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isKaraokeMode && activeLinePairRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const activeElement = activeLinePairRef.current;

      const containerRect = container.getBoundingClientRect();
      const elementRect = activeElement.getBoundingClientRect();

      // Condition 1: Element is scrolled above the visible area of the container
      const isAbove = elementRect.top < containerRect.top;

      // Condition 2: Element is approaching the bottom (preemptive scroll)
      let isApproachingBottom = false;
      const activeLineHeight = activeElement.offsetHeight;

      if (activeLineHeight > 0) {
        const remainingSpaceBelow = containerRect.bottom - elementRect.bottom;
        // Preemptively scroll if less than ~1.5 line heights are visible below the active line
        const bufferToKeep = activeLineHeight * 1.5; 
        if (remainingSpaceBelow < bufferToKeep) {
          isApproachingBottom = true;
        }
      } else {
        // Fallback: if line height is 0 (e.g., display:none temporarily), 
        // scroll if the element's bottom is in the lower 35% of the container.
        if (elementRect.bottom > (containerRect.top + containerRect.height * 0.65)) {
           isApproachingBottom = true;
        }
      }
      
      // Condition 3: Element is definitively past the bottom of the container
      const isPastBottom = elementRect.bottom > containerRect.bottom;

      if (isAbove || isApproachingBottom || isPastBottom) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [currentTime, isKaraokeMode, verse]); 

  if (!verse) {
    return <div className="text-center text-slate-400 py-8">No verse data available.</div>;
  }
  
  const isInstrumentalSong = originalLanguageLabel === "Instrumental";

  const renderLyricPairs = () => {
    let linePairs: { translit: string | null, translat: string | null, isActiveTlit: boolean, isActiveTlat: boolean, startTime?: number, endTime?: number }[] = [];

    if (isKaraokeMode && verse.transliterationSegments && verse.translationSegments) {
      const numTranslitSegments = verse.transliterationSegments.length;
      const numTranslatSegments = verse.translationSegments.length;
      
      const maxLength = Math.max(numTranslitSegments, numTranslatSegments);

      for (let i = 0; i < maxLength; i++) {
        const tlitSeg = verse.transliterationSegments[i];
        const tlatSeg = verse.translationSegments && verse.translationSegments.length > i ? verse.translationSegments[i] : null;

        let pair: { translit: string | null, translat: string | null, isActiveTlit: boolean, isActiveTlat: boolean, startTime?: number, endTime?: number } = {
            translit: null,
            translat: null,
            isActiveTlit: false,
            isActiveTlat: false,
        };
        
        if (tlitSeg) {
            pair.translit = tlitSeg.text;
            pair.startTime = tlitSeg.startTime;
            pair.endTime = tlitSeg.endTime;
            pair.isActiveTlit = currentTime >= tlitSeg.startTime && currentTime < tlitSeg.endTime;
        }
        
        if (tlatSeg) {
            pair.translat = tlatSeg.text;
            if (!pair.startTime && tlatSeg.startTime) pair.startTime = tlatSeg.startTime;
            if (!pair.endTime && tlatSeg.endTime) pair.endTime = tlatSeg.endTime;
            pair.isActiveTlat = pair.startTime !== undefined && pair.endTime !== undefined &&
                                currentTime >= pair.startTime && currentTime < pair.endTime;
        } else if (tlitSeg) { 
             pair.isActiveTlat = pair.isActiveTlit;
        }

        if (pair.translit || pair.translat) { 
             linePairs.push(pair);
        }
      }
      if (linePairs.length === 0 && (verse.transliteration || verse.translation)) {
         linePairs.push({ 
            translit: verse.transliteration || "Transliteration segments missing.",
            translat: verse.translation || "Translation segments missing.",
            isActiveTlit: false, 
            isActiveTlat: false 
        });
      }

    } else { // Non-Karaoke Mode
      const translitLines = (verse.transliteration || "").split('\n');
      const translatLines = (verse.translation || "").split('\n');
      const maxLength = Math.max(translitLines.length, translatLines.length);

      for (let i = 0; i < maxLength; i++) {
        linePairs.push({
          translit: translitLines[i] !== undefined ? translitLines[i] : null,
          translat: translatLines[i] !== undefined ? translatLines[i] : null,
          isActiveTlit: false, 
          isActiveTlat: false
        });
      }
    }

    if (isInstrumentalSong && linePairs.every(p => !p.translit && !p.translat)) {
       return <div className="lyric-line-pair"><div className="translit-segment lyric-line-transliteration">{renderWords("Instrumental Section")}</div></div>;
    }
    if (linePairs.length === 0) {
        return <div className="lyric-line-pair"><div className="translit-segment lyric-line-transliteration">{renderWords("Lyrics not available for this verse.")}</div></div>;
    }

    return linePairs.map((pair, index) => {
      const isOverallActivePair = pair.isActiveTlit || pair.isActiveTlat; 
      return (
        <div 
          key={`line-pair-${index}`} 
          className="lyric-line-pair"
          ref={isOverallActivePair ? activeLinePairRef : null}
        >
          {pair.translit !== null && (
            <div className={`lyric-line-transliteration translit-segment ${pair.isActiveTlit ? 'active-translit-segment' : ''}`}>
              {renderWords(pair.translit)}
            </div>
          )}
          {pair.translat !== null && (
            <div className={`lyric-line-translation translation-segment ${pair.isActiveTlat ? 'active-translation-segment' : ''}`}>
              {renderWords(pair.translat)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="bg-slate-800/60 p-5 md:p-6 rounded-xl shadow-xl backdrop-blur-sm current-verse-display-wrapper">
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
            <Icon name={isKaraokeMode ? "microphone-stage" : "list-dashes"} weight="bold" className="mr-2" />
            {isKaraokeMode ? "Synced Lyrics" : "Lyrics"}
            <span className="text-xs text-slate-400 ml-1"> (Transliteration & Translation to {targetLanguage})</span>
          </h3>
          <div ref={scrollContainerRef} className="lyrics-scroll-container">
            {renderLyricPairs()}
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
