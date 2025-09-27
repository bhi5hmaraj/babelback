import type { Language } from './prompts.js';

export interface Verse {
  verseNumber: number;
  original: string;
  translation: string;
  transliteration: string;
  transliterationSegments?: { text: string; startTime: number; endTime: number }[];
  translationSegments?: { text: string; startTime: number; endTime: number }[];
  meaning: string;
  startTime: number;
  endTime: number;
}

export type RawSegment = { text: string; startTime: string; endTime: string };

export type RawVerse = Omit<Verse, 'startTime' | 'endTime' | 'transliterationSegments' | 'translationSegments' | 'transliteration' | 'translation' | 'verseNumber'> & {
  verseNumber?: number;
  startTime: string;
  endTime: string;
  transliteration?: string;
  translation?: string;
  transliterationSegments?: RawSegment[];
  translationSegments?: RawSegment[];
};

export const MIN_SEGMENT_DURATION = 0.3; // 300ms

export const parseTimeStringToSeconds = (timeStr: string): number => {
  if (typeof timeStr !== 'string') return 0;
  const mainParts = timeStr.split(':');
  if (mainParts.length !== 2) return 0;
  const minutes = parseInt(mainParts[0], 10);
  let seconds = 0;
  let milliseconds = 0;
  if (mainParts[1].includes('.')) {
    const secondParts = mainParts[1].split('.');
    if (secondParts.length === 2) {
      seconds = parseInt(secondParts[0], 10);
      milliseconds = parseInt(secondParts[1], 10);
      if (secondParts[1].length === 1) milliseconds *= 100;
      else if (secondParts[1].length === 2) milliseconds *= 10;
    }
  } else {
    seconds = parseInt(mainParts[1], 10);
  }
  if (isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) return 0;
  return minutes * 60 + seconds + milliseconds / 1000;
};

export const parseSongVerses = (
  rawVerses: RawVerse[],
  enableKaraokeMode: boolean,
  targetLanguage: Language,
  onProgress?: (message: string) => void
): Verse[] => {
  const processed: Verse[] = [];
  try { console.log('[parser] start', { count: rawVerses.length, enableKaraokeMode, targetLanguage }); } catch {}
  if (rawVerses.length > 0) {
    if (onProgress) onProgress('Structuring verse-by-verse details...');
    for (const rawVerse of rawVerses) {
      if (
        typeof rawVerse.original !== 'string' ||
        typeof rawVerse.meaning !== 'string' ||
        typeof rawVerse.startTime !== 'string' ||
        typeof rawVerse.endTime !== 'string'
      ) {
        try { console.warn('[parser] skipping invalid verse shape', { rawVerse }); } catch {}
        continue;
      }
      const verseStartTime = parseTimeStringToSeconds(rawVerse.startTime);
      const verseEndTime = parseTimeStringToSeconds(rawVerse.endTime);

      const current: Verse = {
        verseNumber: -1,
        original: rawVerse.original,
        translation: '',
        transliteration: '',
        meaning: rawVerse.meaning,
        startTime: verseStartTime,
        endTime: verseEndTime,
      };

      if (enableKaraokeMode) {
        const tlit = Array.isArray(rawVerse.transliterationSegments) ? rawVerse.transliterationSegments : [];
        const tlat = Array.isArray(rawVerse.translationSegments) ? rawVerse.translationSegments : [];
        current.transliterationSegments = tlit.map((segment) => {
          let s = parseTimeStringToSeconds(segment.startTime);
          let e = parseTimeStringToSeconds(segment.endTime);
          if (e <= s) e = s + MIN_SEGMENT_DURATION;
          return { text: segment.text, startTime: s, endTime: e };
        });
        current.transliteration = current.transliterationSegments.map((s) => s.text).join(' ');
        current.translationSegments = tlat.map((segment) => {
          let s = parseTimeStringToSeconds(segment.startTime);
          let e = parseTimeStringToSeconds(segment.endTime);
          if (e <= s) e = s + MIN_SEGMENT_DURATION;
          return { text: segment.text, startTime: s, endTime: e };
        });
        current.translation = current.translationSegments.map((s) => s.text).join(' ');

        if (current.transliterationSegments.length === 0 && rawVerse.transliteration) {
          current.transliteration = rawVerse.transliteration;
        } else if (current.transliterationSegments.length === 0 && !rawVerse.transliteration) {
          current.transliteration = 'Transliteration segments missing and no fallback provided by AI.';
        }
        if (current.translationSegments.length === 0 && rawVerse.translation) {
          current.translation = rawVerse.translation;
        } else if (current.translationSegments.length === 0 && !rawVerse.translation) {
          current.translation = `Translation to ${targetLanguage} segments missing and no fallback provided by AI.`;
        }
      } else {
        current.transliteration = rawVerse.transliteration || 'Transliteration not provided by AI.';
        current.translation = rawVerse.translation || `Translation to ${targetLanguage} not provided by AI.`;
      }

      processed.push(current);
    }
  }

  if (onProgress) onProgress('Organizing the symphony of data...');
  const sorted = [...processed].sort((a, b) => a.startTime - b.startTime);
  const finalVerses = sorted.map((v, i) => ({ ...v, verseNumber: i + 1 }));
  try { console.log('[parser] done', { finalCount: finalVerses.length }); } catch {}
  return finalVerses;
};
