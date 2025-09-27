
import { Verse, RawVerse, Language } from '../types';

export const MIN_SEGMENT_DURATION = 0.3; // 300ms, a more visible minimum duration for highlighting

// Helper function to parse "MM:SS" or "MM:SS.sss" string to seconds
export const parseTimeStringToSeconds = (timeStr: string): number => {
  if (typeof timeStr !== 'string') {
    console.warn(`[verseParser.ts parseTimeStringToSeconds] Invalid timestamp format: expected string, got ${typeof timeStr}`, timeStr);
    return 0;
  }
  const mainParts = timeStr.split(':');
  if (mainParts.length !== 2) {
    console.warn(`[verseParser.ts parseTimeStringToSeconds] Invalid time format: '${timeStr}'. Expected MM:SS or MM:SS.sss, got ${mainParts.length} parts after splitting by ':'. Defaulting to 0.`);
    return 0;
  }

  const minutes = parseInt(mainParts[0], 10);
  let seconds = 0;
  let milliseconds = 0;

  if (mainParts[1].includes('.')) {
    const secondParts = mainParts[1].split('.');
    if (secondParts.length === 2) {
      seconds = parseInt(secondParts[0], 10);
      milliseconds = parseInt(secondParts[1], 10);
       // Ensure milliseconds are padded correctly if they are e.g. .1 (100ms) or .01 (10ms)
      if (secondParts[1].length === 1) milliseconds *= 100;
      else if (secondParts[1].length === 2) milliseconds *= 10;

    } else {
      console.warn(`[verseParser.ts parseTimeStringToSeconds] Invalid seconds.milliseconds format: '${mainParts[1]}' in '${timeStr}'. Defaulting to 0 for this part.`);
    }
  } else {
    seconds = parseInt(mainParts[1], 10);
  }

  if (isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
    console.warn(`[verseParser.ts parseTimeStringToSeconds] Invalid number in time format: '${timeStr}' (parsed: min=${minutes}, sec=${seconds}, ms=${milliseconds}). Defaulting to 0.`);
    return 0;
  }
  return (minutes * 60) + seconds + (milliseconds / 1000);
};

export const parseSongVerses = (
    rawVerses: RawVerse[],
    enableKaraokeMode: boolean,
    targetLanguage: Language, // Not directly used in parsing but good for context if needed later
    onProgress?: (message: string) => void
): Verse[] => {
    const processedVerses: Verse[] = [];

    if (rawVerses.length > 0) {
        if (onProgress) onProgress("Structuring verse-by-verse details...");
        for (const rawVerse of rawVerses) {
            if (typeof rawVerse.original !== 'string' ||
                typeof rawVerse.meaning !== 'string' ||
                typeof rawVerse.startTime !== 'string' ||
                typeof rawVerse.endTime !== 'string') {
                console.warn("[verseParser.ts parseSongVerses] A verse has incorrect data types or missing common fields:", rawVerse);
                // Potentially skip this verse or add a placeholder
                continue; 
            }
            
            // Verse number from AI is optional, we re-assign it after sorting.
            const verseNumberFromAI = typeof rawVerse.verseNumber === 'number' ? rawVerse.verseNumber : -1;


            if (enableKaraokeMode) {
                if (!Array.isArray(rawVerse.transliterationSegments) || !Array.isArray(rawVerse.translationSegments)) {
                    console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}): Karaoke mode expects 'transliterationSegments' and 'translationSegments' arrays. Found: tlit=${typeof rawVerse.transliterationSegments}, tlat=${typeof rawVerse.translationSegments}.`, rawVerse);
                    rawVerse.transliterationSegments = []; // Ensure arrays exist for safety
                    rawVerse.translationSegments = [];
                }
            } else {
                if (typeof rawVerse.transliteration !== 'string' || typeof rawVerse.translation !== 'string') {
                    console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}): Non-Karaoke mode: Transliteration/Translation strings missing or not strings.`, rawVerse);
                    // Provide fallbacks if missing
                    rawVerse.transliteration = rawVerse.transliteration || "Transliteration not provided by AI";
                    rawVerse.translation = rawVerse.translation || `Translation to ${targetLanguage} not provided by AI`;
                }
            }

            const verseStartTime = parseTimeStringToSeconds(rawVerse.startTime);
            const verseEndTime = parseTimeStringToSeconds(rawVerse.endTime);
            if (verseEndTime < verseStartTime && !(verseStartTime === 0 && verseEndTime === 0)) { // Allow 0,0 for error segments
                console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}) has endTime (${rawVerse.endTime}) < startTime (${rawVerse.startTime}). Adjusting endTime.`, rawVerse);
                 // No adjustment here, let segments handle their own duration; verse time is overall
            }

            const currentVerse: Verse = {
                verseNumber: -1, // Will be re-assigned after sorting
                original: rawVerse.original,
                translation: "", // Will be populated below
                transliteration: "", // Will be populated below
                meaning: rawVerse.meaning,
                startTime: verseStartTime,
                endTime: verseEndTime,
            };

            if (enableKaraokeMode && rawVerse.transliterationSegments && rawVerse.translationSegments) {
                currentVerse.transliterationSegments = rawVerse.transliterationSegments.map((segment, segIdx) => {
                    if (typeof segment.text !== 'string' || typeof segment.startTime !== 'string' || typeof segment.endTime !== 'string') {
                        console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}), Translit Seg ${segIdx}: Malformed segment structure. Original:`, segment, `Defaulting to Error segment.`);
                        return { text: "Error: Malformed segment", startTime: 0, endTime: MIN_SEGMENT_DURATION };
                    }
                    let parsedStartTime = parseTimeStringToSeconds(segment.startTime);
                    let parsedEndTime = parseTimeStringToSeconds(segment.endTime);
                    
                    if (parsedStartTime === 0 && parsedEndTime === 0 && (segment.startTime !== "00:00.000" && segment.startTime !== "0:0.000" && segment.startTime !== "00:00" && segment.startTime !== "0:0" || segment.endTime !== "00:00.000" && segment.endTime !== "0:0.000" && segment.endTime !== "00:00" && segment.endTime !== "0:0")) {
                        console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}), Translit Seg ${segIdx}: Both startTime ('${segment.startTime}') and endTime ('${segment.endTime}') parsed to 0. This might indicate invalid time strings from AI.`);
                    }

                    if (parsedEndTime <= parsedStartTime) {
                        if (!(parsedStartTime === 0 && parsedEndTime === 0 && segment.text.toLowerCase().includes("error"))) { // Don't log for intentional error segments
                            // console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}), Translit Seg ${segIdx}: endTime ('${segment.endTime}') <= startTime ('${segment.startTime}'). Adjusting endTime.`);
                        }
                        parsedEndTime = parsedStartTime + MIN_SEGMENT_DURATION;
                    }
                    return { text: segment.text, startTime: parsedStartTime, endTime: parsedEndTime };
                });
                currentVerse.transliteration = currentVerse.transliterationSegments.map(s => s.text).join(' ');

                currentVerse.translationSegments = rawVerse.translationSegments.map((segment, segIdx) => {
                    if (typeof segment.text !== 'string' || typeof segment.startTime !== 'string' || typeof segment.endTime !== 'string') {
                        console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}), Translat Seg ${segIdx}: Malformed segment structure. Original:`, segment, `Defaulting to Error segment.`);
                        return { text: "Error: Malformed segment", startTime: 0, endTime: MIN_SEGMENT_DURATION };
                    }
                    let parsedStartTime = parseTimeStringToSeconds(segment.startTime);
                    let parsedEndTime = parseTimeStringToSeconds(segment.endTime);

                    if (parsedStartTime === 0 && parsedEndTime === 0 && (segment.startTime !== "00:00.000" && segment.startTime !== "0:0.000" && segment.startTime !== "00:00" && segment.startTime !== "0:0" || segment.endTime !== "00:00.000" && segment.endTime !== "0:0.000" && segment.endTime !== "00:00" && segment.endTime !== "0:0")) {
                        console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}), Translat Seg ${segIdx}: Both startTime ('${segment.startTime}') and endTime ('${segment.endTime}') parsed to 0. This might indicate invalid time strings from AI.`);
                    }

                    if (parsedEndTime <= parsedStartTime) {
                         if (!(parsedStartTime === 0 && parsedEndTime === 0 && segment.text.toLowerCase().includes("error"))) {
                            // console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}), Translat Seg ${segIdx}: endTime ('${segment.endTime}') <= startTime ('${segment.startTime}'). Adjusting endTime.`);
                        }
                        parsedEndTime = parsedStartTime + MIN_SEGMENT_DURATION;
                    }
                    return { text: segment.text, startTime: parsedStartTime, endTime: parsedEndTime };
                });
                currentVerse.translation = currentVerse.translationSegments.map(s => s.text).join(' ');

                // Fallback for empty segment arrays but existing fallback text from AI
                if (currentVerse.transliterationSegments.length === 0 && rawVerse.transliteration) {
                    currentVerse.transliteration = rawVerse.transliteration;
                    console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}): Karaoke mode, but transliterationSegments array was empty or invalid. Using full transliteration string fallback from AI.`);
                } else if (currentVerse.transliterationSegments.length === 0 && !rawVerse.transliteration) {
                    currentVerse.transliteration = "Transliteration segments missing and no fallback provided by AI.";
                }

                if (currentVerse.translationSegments.length === 0 && rawVerse.translation) {
                    currentVerse.translation = rawVerse.translation;
                     console.warn(`[verseParser.ts parseSongVerses] Verse (AI# ${verseNumberFromAI}): Karaoke mode, but translationSegments array was empty or invalid. Using full translation string fallback from AI.`);
                } else if (currentVerse.translationSegments.length === 0 && !rawVerse.translation) {
                    currentVerse.translation = `Translation to ${targetLanguage} segments missing and no fallback provided by AI.`;
                }

            } else if (!enableKaraokeMode) {
                currentVerse.transliteration = rawVerse.transliteration || "Transliteration not provided by AI.";
                currentVerse.translation = rawVerse.translation || `Translation to ${targetLanguage} not provided by AI.`;
            }

            processedVerses.push(currentVerse);
        }
    }

    if (onProgress) onProgress("Organizing the symphony of data...");
    const sortedVerses = [...processedVerses].sort((a, b) => a.startTime - b.startTime);
    
    // Re-assign verse numbers sequentially after sorting
    const finalVerses = sortedVerses.map((verse, index) => ({
        ...verse,
        verseNumber: index + 1, 
    }));
    
    return finalVerses;
};
