
import React, { useRef, useEffect } from 'react';
import { Verse, PanelVisibility } from '../types';
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
    <div className="p-2 mt-2 transition-all duration-200">
      <h3 className={`text-xs font-semibold ${iconColorClass} mb-1 tracking-wide flex items-center`}>
        {iconName && <Icon name={iconName} weight="bold" className="mr-2" />}
        {title} {language && <span className="text-xs text-slate-400">({language})</span>}
      </h3>
      {typeof content === 'string' ? (
        <p className="text-slate-200 whitespace-pre-wrap leading-snug text-sm">{content || "N/A"}</p>
      ) : (
        <div className="text-slate-200 leading-snug text-sm">{content || "N/A"}</div>
      )}
    </div>
  );
};

/** Props for the synchronized verse view. */
interface VerseDisplayProps {
  verse: Verse;
  targetLanguage: string;
  originalLanguageLabel: string;
  panelVisibility: PanelVisibility;
  currentTime: number;
  isKaraokeMode: boolean;
  onLyricAreaFocus?: () => void; // called when user taps/clicks lyrics pane
  onLyricAreaScrollUp?: () => void; // called when user scrolls up inside lyrics
}

// Render a plain lyric line with native spacing and wrapping (fixes cramped words on mobile).
const renderLineText = (lineText: string) => (
  <span className="whitespace-pre-wrap break-normal">{lineText && lineText.length > 0 ? lineText : '\u00A0'}</span>
);

// Render transliteration text as per-word underlines (keeps line height stable and helps chunking)
const renderTranslitWords = (text: string) => {
  if (!text) return renderLineText('');
  const parts = text.trim().split(/\s+/);
  return (
    <span className="whitespace-pre-wrap break-normal">
      {parts.map((tok, i) => (
        <span key={i}>
          <span className="translit-word">{tok}</span>
          {i < parts.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
};


/**
 * Renders the current verse with synchronized lines.
 * - In Karaoke mode, highlights phrase timings and auto-centers the active line.
 * - On mobile, words render inline for readability (no chips).
 */
const VerseDisplay: React.FC<VerseDisplayProps> = ({
  verse,
  targetLanguage,
  originalLanguageLabel,
  panelVisibility,
  currentTime,
  isKaraokeMode,
  onLyricAreaFocus,
  onLyricAreaScrollUp,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeLinePairRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(0);
  const autoScrollingRef = useRef<boolean>(false);
  const userScrollOverrideUntilRef = useRef<number>(0);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const activeEl = activeLinePairRef.current;
    if (!container || !activeEl) return;
    if (Date.now() < userScrollOverrideUntilRef.current) return; // user is reviewing lyrics

    // Keep the active line centered (or near the center) in the scroll viewport.
    const containerHeight = container.clientHeight;
    const elCenter = activeEl.offsetTop + activeEl.offsetHeight / 2; // relative to container scroll content
    const targetScrollTop = Math.max(0, elCenter - containerHeight / 2);

    // Only adjust if we're far enough from the target to avoid jitter.
    const delta = Math.abs(container.scrollTop - targetScrollTop);
    if (delta > 16) {
      autoScrollingRef.current = true;
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      window.setTimeout(() => { autoScrollingRef.current = false; }, 240);
    }
  }, [currentTime, verse]);

  // Detect upward user scrolls to reveal header
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (autoScrollingRef.current) return; // ignore programmatic centering
      const current = el.scrollTop;
      const last = lastScrollTopRef.current;
      if (!autoScrollingRef.current) {
        userScrollOverrideUntilRef.current = Date.now() + 4000; // pause auto-centering for a moment
      }
      // if user scrolled up by a noticeable amount
      if (current < last - 12) {
        onLyricAreaScrollUp && onLyricAreaScrollUp();
      }
      lastScrollTopRef.current = current;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); };
  }, [onLyricAreaScrollUp]);

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
       return <div className="lyric-line-pair"><div className="translit-segment lyric-line-transliteration">{renderLineText("Instrumental Section")}</div></div>;
    }
    if (linePairs.length === 0) {
        return <div className="lyric-line-pair"><div className="translit-segment lyric-line-transliteration">{renderLineText("Lyrics not available for this verse.")}</div></div>;
    }

    // Determine which pair should be considered active for centering
    let activeIdx = linePairs.findIndex(p => p.isActiveTlit || p.isActiveTlat)
    if (activeIdx === -1) {
      // Fallback: choose the nearest by startTime to currentTime
      let best = Infinity; let bestIdx = 0
      for (let i = 0; i < linePairs.length; i++) {
        const st = linePairs[i].startTime
        if (typeof st === 'number') {
          const d = Math.abs(st - currentTime)
          if (d < best) { best = d; bestIdx = i }
        }
      }
      activeIdx = best === Infinity ? 0 : bestIdx
    }

    return linePairs.map((pair, index) => {
      const isOverallActivePair = (pair.isActiveTlit || pair.isActiveTlat) || index === activeIdx; 
      return (
        <div 
          key={`line-pair-${index}`} 
          className="lyric-line-pair"
          ref={isOverallActivePair ? activeLinePairRef : null}
        >
          {pair.translit !== null && (
            <div className={`lyric-line-transliteration translit-segment ${pair.isActiveTlit ? 'active-translit-segment' : ''}`}>
              {renderTranslitWords(pair.translit)}
            </div>
          )}
          {pair.translat !== null && (
            <div className={`lyric-line-translation translation-segment ${pair.isActiveTlat ? 'active-translation-segment' : ''}`}>
              {renderLineText(pair.translat)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="p-1 md:p-2 current-verse-display-wrapper">
      <h2 className="text-lg md:text-xl font-semibold text-slate-100 mb-0.5">
        Verse {verse.verseNumber}
      </h2>
      <p className="text-[10px] text-slate-400 mb-2">
        Original Lyrics Language: {originalLanguageLabel} | Timings: {new Date(verse.startTime * 1000).toISOString().substr(14, 5)} - {new Date(verse.endTime * 1000).toISOString().substr(14, 5)}
      </p>
      <div className="border-b border-slate-700 mb-2"></div>

      {panelVisibility.lyrics && (
        <div className="p-0 rounded-lg mb-1">
          <h3 className="text-xs font-semibold text-sky-400 mb-1 tracking-wide flex items-center">
            <Icon name={isKaraokeMode ? "microphone-stage" : "list-dashes"} weight="bold" className="mr-2" />
            {isKaraokeMode ? "Synced Lyrics" : "Lyrics"}
            <span className="text-xs text-slate-400 ml-1"> (Transliteration & Translation to {targetLanguage})</span>
          </h3>
          <div
            ref={scrollContainerRef}
          className="lyrics-scroll-container"
            onPointerDown={() => {
              userScrollOverrideUntilRef.current = Date.now() + 4000;
              if (onLyricAreaFocus) onLyricAreaFocus();
            }}
          >
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
