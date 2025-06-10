
import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { SongData, Language, Verse, TransliterationSegment, TranslationSegment, SingingScore, VerseSingingScore } from '../types';
import { GEMINI_MODEL_TEXT } from '../constants';
import { getSongAnalysisSystemPrompt, getSingingFeedbackPrompt, ReferenceVerseForPrompt } from './prompts'; // Import prompt generators

let ai: GoogleGenAI | null = null;
let apiKeyResolved: string | undefined = undefined;

try {
  console.log(JSON.stringify(process));
  if (typeof process !== 'undefined' && process.env && typeof process.env.GEMINI_API_KEY === 'string') {
    apiKeyResolved = process.env.GEMINI_API_KEY;
  }
  if (typeof process !== 'undefined' && process.env && typeof process.env.API_KEY === 'string') {
    apiKeyResolved = process.env.API_KEY;
  }
} catch (e) {
  console.error("[geminiService.ts Global] Error accessing process.env.API_KEY:", e);
}

if (apiKeyResolved) {
  ai = new GoogleGenAI({ apiKey: apiKeyResolved });
  console.log("[geminiService.ts Global] GoogleGenAI client initialized.");
} else {
  console.error("[geminiService.ts Global] API_KEY environment variable not set or process.env is not accessible. Gemini API functionality will be disabled.");
}

// Helper function to parse "MM:SS" or "MM:SS.sss" string to seconds
const parseTimeStringToSeconds = (timeStr: string): number => {
  if (typeof timeStr !== 'string') {
    console.warn(`[geminiService.ts parseTimeStringToSeconds] Invalid timestamp format: expected string, got ${typeof timeStr}`, timeStr);
    return 0;
  }
  const mainParts = timeStr.split(':');
  if (mainParts.length !== 2) {
    console.warn(`[geminiService.ts parseTimeStringToSeconds] Invalid time format: ${timeStr}. Expected MM:SS or MM:SS.sss, got ${mainParts.length} parts after splitting by ':'.`);
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
      console.warn(`[geminiService.ts parseTimeStringToSeconds] Invalid seconds.milliseconds format: ${mainParts[1]} in ${timeStr}`);
      return 0;
    }
  } else {
    seconds = parseInt(mainParts[1], 10);
  }

  if (isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
    console.warn(`[geminiService.ts parseTimeStringToSeconds] Invalid number in time format: ${timeStr}`);
    return 0;
  }
  return (minutes * 60) + seconds + (milliseconds / 1000);
};

const formatSecondsToMMSSsss = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((totalSeconds - (minutes * 60) - seconds) * 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

// Helper function to convert Blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]); // Remove the "data:mime/type;base64," prefix
      } else {
        reject(new Error("[geminiService.ts blobToBase64] Failed to read blob as base64 string."));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};


export const fetchSongDataFromGemini = async (
  audioFile: File,
  targetLanguage: Language,
  enableKaraokeMode: boolean,
  onProgress?: (message: string) => void
): Promise<SongData> => {
  // console.log('[geminiService.ts fetchSongDataFromGemini] Initiating song data fetch. File:', audioFile.name, 'Target Lang:', targetLanguage, 'Karaoke:', enableKaraokeMode);
  if (!ai) {
    console.error("[geminiService.ts fetchSongDataFromGemini] Gemini API client not initialized.");
    throw new Error("Gemini API client is not initialized. API_KEY might be missing or inaccessible.");
  }

  let uploadedFileUri: string | undefined;
  let uploadedFileMimeType: string | undefined;

  try {
    if (onProgress) onProgress("Securely uploading your audio...");
    // console.log("[geminiService.ts fetchSongDataFromGemini] Uploading audio file...");
    const uploadResult = await ai.files.upload({
        file: audioFile,
        config: { mimeType: audioFile.type || 'audio/mp3' },
    });
    // console.log("[geminiService.ts fetchSongDataFromGemini] Audio upload API response:", uploadResult);

    uploadedFileUri = uploadResult.uri;
    uploadedFileMimeType = uploadResult.mimeType;

    if (!uploadedFileUri || !uploadedFileMimeType) {
        console.error("[geminiService.ts fetchSongDataFromGemini] File upload failed: 'uri' or 'mimeType' missing in file details.", uploadResult);
        throw new Error("Audio file upload failed: Essential file details missing after upload.");
    }
    if (onProgress) onProgress("Upload complete! Awakening the AI lyricist...");
    // console.log(`[geminiService.ts fetchSongDataFromGemini] File uploaded successfully. URI: ${uploadedFileUri}, MIME Type: ${uploadedFileMimeType}`);
  } catch (uploadError: any) {
    console.error("[geminiService.ts fetchSongDataFromGemini] Error during file upload to Gemini Files API:", uploadError);
    throw new Error(`Failed to upload audio file: ${uploadError.message || 'Unknown upload error'}`);
  }

  if (onProgress) onProgress("AI is deciphering the melody and words...");
  const parts: Part[] = [
    {
      fileData: {
        mimeType: uploadedFileMimeType,
        fileUri: uploadedFileUri,
      },
    },
    {
      text: `Target Language for all user-facing text outputs (translation, transliteration, meaning, summary, detailed analysis): ${targetLanguage}.
Original filename (for reference if title is not discernible): "${audioFile.name}".
Karaoke Mode Active: ${enableKaraokeMode}.
The provided audio file should be processed in its entirety.
Please analyze this complete audio file according to the system instructions.`
    },
  ];

  const systemInstruction = getSongAnalysisSystemPrompt(targetLanguage, enableKaraokeMode, audioFile.name);
  // console.log("[geminiService.ts fetchSongDataFromGemini] Generated system instruction for song analysis. Length:", systemInstruction.length);

  let geminiApiResponse: GenerateContentResponse | undefined;

  try {
    if (onProgress) onProgress("AI is listening carefully to the music...");
    // console.log("[geminiService.ts fetchSongDataFromGemini] Sending request to Gemini generateContent API...");
    geminiApiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        systemInstruction: systemInstruction,
      }
    });
    // console.log("[geminiService.ts fetchSongDataFromGemini] Received response from Gemini API.");

    if (onProgress) onProgress("AI has spoken! Interpreting the lyrical scrolls...");
    if (!geminiApiResponse) {
      console.error("[geminiService.ts fetchSongDataFromGemini] No response received from Gemini API.");
      throw new Error("No response received from Gemini API.");
    }

    // console.log("[geminiService.ts fetchSongDataFromGemini] Raw AI response text (first 500 chars):", geminiApiResponse.text?.substring(0, 500));

    let jsonStr = geminiApiResponse.text.trim();
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[1]) {
      jsonStr = match[1].trim();
      // console.log("[geminiService.ts fetchSongDataFromGemini] Extracted JSON from markdown fence.");
    }

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        console.error("[geminiService.ts fetchSongDataFromGemini] Response text does not appear to contain a valid JSON object:", geminiApiResponse.text);
        throw new Error("Received non-JSON response from AI, or JSON structure is broken.");
    }
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    // console.log("[geminiService.ts fetchSongDataFromGemini] Attempting to parse JSON string.");

    type RawSegment = { text: string; startTime: string; endTime: string };
    type RawVerse = Omit<Verse, 'startTime' | 'endTime' | 'transliterationSegments' | 'translationSegments' | 'transliteration' | 'translation'> & {
        startTime: string;
        endTime: string;
        transliteration?: string;
        translation?: string;
        transliterationSegments?: RawSegment[];
        translationSegments?: RawSegment[];
    };
    type RawSongData = Omit<SongData, 'verses'> & { verses: RawVerse[]; };

    if (onProgress) onProgress("Translating and analyzing insights...");
    const parsedData = JSON.parse(jsonStr) as Partial<RawSongData>;
    // console.log("[geminiService.ts fetchSongDataFromGemini] Successfully parsed JSON. Parsed data title:", parsedData.title);

    if (!parsedData.title || typeof parsedData.title !== 'string' ||
        !parsedData.originalLanguage || typeof parsedData.originalLanguage !== 'string' ||
        !parsedData.summary || typeof parsedData.summary !== 'string' ||
        !parsedData.detailedAnalysis || typeof parsedData.detailedAnalysis !== 'string' ||
        !parsedData.verses || !Array.isArray(parsedData.verses)) {
      console.error("[geminiService.ts fetchSongDataFromGemini] Parsed data is missing required fields or has wrong types:", parsedData);
      throw new Error("Received malformed song data from AI.");
    }

    const processedVerses: Verse[] = [];

    if (parsedData.verses.length > 0) {
      if (onProgress) onProgress("Structuring verse-by-verse details...");
      // console.log(`[geminiService.ts fetchSongDataFromGemini] Processing ${parsedData.verses.length} verses.`);
      for (const rawVerse of parsedData.verses as RawVerse[]) {
        if (typeof rawVerse.verseNumber !== 'number' ||
            typeof rawVerse.original !== 'string' ||
            typeof rawVerse.meaning !== 'string' ||
            typeof rawVerse.startTime !== 'string' ||
            typeof rawVerse.endTime !== 'string') {
            console.error("[geminiService.ts fetchSongDataFromGemini] A verse has incorrect data types or missing common fields:", rawVerse);
            throw new Error("Received malformed verse data. Check common fields.");
        }

        if (enableKaraokeMode) {
          if (!Array.isArray(rawVerse.transliterationSegments) || !Array.isArray(rawVerse.translationSegments)) {
            console.error("[geminiService.ts fetchSongDataFromGemini] Karaoke mode: Segments arrays missing or not arrays.", rawVerse);
            throw new Error("Karaoke mode verse data malformed (segments).");
          }
        } else {
          if (typeof rawVerse.transliteration !== 'string' || typeof rawVerse.translation !== 'string') {
            console.error("[geminiService.ts fetchSongDataFromGemini] Non-Karaoke mode: Transliteration/Translation strings missing or not strings.", rawVerse);
            throw new Error("Non-Karaoke mode verse data malformed (strings).");
          }
        }

        const verseStartTime = parseTimeStringToSeconds(rawVerse.startTime);
        const verseEndTime = parseTimeStringToSeconds(rawVerse.endTime);
        if (verseEndTime < verseStartTime && !(verseStartTime === 0 && verseEndTime === 0)) {
            console.warn(`[geminiService.ts fetchSongDataFromGemini] A verse has endTime (${rawVerse.endTime}) < startTime (${rawVerse.startTime}):`, rawVerse);
        }

        const currentVerse: Verse = {
            verseNumber: rawVerse.verseNumber,
            original: rawVerse.original,
            translation: "",
            transliteration: "",
            meaning: rawVerse.meaning,
            startTime: verseStartTime,
            endTime: verseEndTime,
        };

        if (enableKaraokeMode && rawVerse.transliterationSegments && rawVerse.translationSegments) {
          currentVerse.transliterationSegments = rawVerse.transliterationSegments.map(segment => {
            if (typeof segment.text !== 'string' || typeof segment.startTime !== 'string' || typeof segment.endTime !== 'string') {
              console.warn("[geminiService.ts fetchSongDataFromGemini] Malformed transliteration segment:", segment);
              return { text: "Error", startTime: 0, endTime: 0 };
            }
            return {
              text: segment.text,
              startTime: parseTimeStringToSeconds(segment.startTime),
              endTime: parseTimeStringToSeconds(segment.endTime),
            };
          });
           currentVerse.transliteration = currentVerse.transliterationSegments.map(s => s.text).join(' ');

          currentVerse.translationSegments = rawVerse.translationSegments.map(segment => {
            if (typeof segment.text !== 'string' || typeof segment.startTime !== 'string' || typeof segment.endTime !== 'string') {
              console.warn("[geminiService.ts fetchSongDataFromGemini] Malformed translation segment:", segment);
              return { text: "Error", startTime: 0, endTime: 0 };
            }
            return {
              text: segment.text,
              startTime: parseTimeStringToSeconds(segment.startTime),
              endTime: parseTimeStringToSeconds(segment.endTime),
            };
          });
          currentVerse.translation = currentVerse.translationSegments.map(s => s.text).join(' ');

           if (currentVerse.transliterationSegments.length === 0) {
               currentVerse.transliteration = rawVerse.transliteration || "Transliteration segments missing";
           }
           if (currentVerse.translationSegments.length === 0) {
               currentVerse.translation = rawVerse.translation || "Translation segments missing";
           }

        } else if (!enableKaraokeMode) {
            currentVerse.transliteration = rawVerse.transliteration || "Transliteration not provided";
            currentVerse.translation = rawVerse.translation || "Translation not provided";
        }

        processedVerses.push(currentVerse);
      }
    } else if (parsedData.originalLanguage !== "Instrumental") {
        console.warn("[geminiService.ts fetchSongDataFromGemini] Received song data with an empty verses array, but not marked as Instrumental.");
    }

    if (onProgress) onProgress("Organizing the symphony of data...");
    // console.log("[geminiService.ts fetchSongDataFromGemini] Sorting and re-numbering verses.");
    const sortedVerses = [...processedVerses].sort((a, b) => a.startTime - b.startTime);
    const finalVerses = sortedVerses.map((verse, index) => ({
        ...verse,
        verseNumber: index + 1, // Ensure verseNumber is sequential based on timing after sorting
    }));

    if (onProgress) onProgress("Almost there! Finalizing results...");
    const finalSongData = {
        title: parsedData.title,
        originalLanguage: parsedData.originalLanguage,
        summary: parsedData.summary,
        detailedAnalysis: parsedData.detailedAnalysis,
        verses: finalVerses
    } as SongData;
    console.log("[geminiService.ts fetchSongDataFromGemini] Song data processing complete. Title:", finalSongData.title);
    return finalSongData;

  } catch (e: any) {
    console.error("[geminiService.ts fetchSongDataFromGemini] Error fetching or parsing song data from Gemini:", e);
    if (e instanceof SyntaxError) {
        const responseTextPreview = geminiApiResponse?.text?.substring(0, 500) ?? "No response text captured";
        throw new Error(`Failed to parse AI response as JSON. Response preview: "${responseTextPreview}...". Error: ${e.message}`);
    }
    throw new Error(`Failed to process song: ${e.message || 'Unknown Gemini processing error'}`);
  }
};


// Singing Practice Mode Service
export const fetchSingingFeedback = async (
  audioBlob: Blob,
  referenceVerses: Verse[], // These are the verses the user attempted to sing
  targetLanguage: Language
): Promise<SingingScore> => {
  if (!ai) {
    console.error("[geminiService.ts fetchSingingFeedback] Gemini API client not initialized.");
    throw new Error("Gemini API client is not initialized for singing feedback.");
  }
  if (!referenceVerses || referenceVerses.length === 0) {
    console.error("[geminiService.ts fetchSingingFeedback] No reference verses provided.");
    throw new Error("No reference verses provided for singing feedback.");
  }

  try {
    const audioBase64 = await blobToBase64(audioBlob);

    const referenceVersesInfoForPrompt: ReferenceVerseForPrompt[] = referenceVerses.map(verse => ({
      originalVerseNumber: verse.verseNumber,
      transliteratedText: verse.transliterationSegments && verse.transliterationSegments.length > 0
        ? verse.transliterationSegments.map(s => s.text).join(' ')
        : verse.transliteration || "(Transliteration not available for this verse)",
    }));

    // Prepare segment timings JSON (relative to start of first practiced verse)
    const baseStartTimeForRelativeCalc = referenceVerses[0]?.startTime ?? 0;
    const referenceSegmentTimingsData: { text: string; startTime: string; endTime: string }[] = [];
    referenceVerses.forEach((verse) => {
      if (verse.transliterationSegments && verse.transliterationSegments.length > 0) {
        verse.transliterationSegments.forEach(seg => {
          const relativeStartTime = Math.max(0, seg.startTime - baseStartTimeForRelativeCalc);
          const relativeEndTime = Math.max(0, seg.endTime - baseStartTimeForRelativeCalc);
          referenceSegmentTimingsData.push({
            text: seg.text,
            startTime: formatSecondsToMMSSsss(relativeStartTime),
            endTime: formatSecondsToMMSSsss(relativeEndTime)
          });
        });
      } else if (verse.transliteration) {
        // Fallback if no segments: use verse start/end for timing context of the whole verse
         referenceSegmentTimingsData.push({
            text: `(Full transliteration for verse ${verse.verseNumber}) ${verse.transliteration.substring(0,30)}...`,
            startTime: formatSecondsToMMSSsss(Math.max(0, verse.startTime - baseStartTimeForRelativeCalc)),
            endTime: formatSecondsToMMSSsss(Math.max(0, verse.endTime - baseStartTimeForRelativeCalc))
         });
      }
    });
    const referenceSegmentTimingsJson = JSON.stringify(referenceSegmentTimingsData, null, 2);

    const promptText = getSingingFeedbackPrompt(targetLanguage, referenceVersesInfoForPrompt, referenceSegmentTimingsJson);

    const parts: Part[] = [
      { inlineData: { mimeType: audioBlob.type || 'audio/webm', data: audioBase64 } },
      { text: promptText },
    ];

    const geminiApiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
      }
    });

    if (!geminiApiResponse || !geminiApiResponse.text) {
      console.error("[geminiService.ts fetchSingingFeedback] No response or empty response text received from Gemini API.");
      throw new Error("No response or empty response text received from Gemini API for singing feedback.");
    }

    let jsonStr = geminiApiResponse.text.trim();
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[1]) {
      jsonStr = match[1].trim();
    }

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        console.error("[geminiService.ts fetchSingingFeedback] Singing feedback response text does not appear to contain a valid JSON object:", geminiApiResponse.text);
        throw new Error("Received non-JSON response from AI for singing feedback, or JSON structure is broken.");
    }
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);

    const parsedScore = JSON.parse(jsonStr) as SingingScore;

    // Basic validation for overall scores
    if (typeof parsedScore.overallScore !== 'number' ||
        typeof parsedScore.pronunciationAccuracyScore !== 'number' ||
        typeof parsedScore.timingAlignmentScore !== 'number' ||
        typeof parsedScore.vocalClarityScore !== 'number' ||
        !parsedScore.feedback ||
        !Array.isArray(parsedScore.feedback.positive) ||
        !Array.isArray(parsedScore.feedback.improvementAreas)) {
      console.error("[geminiService.ts fetchSingingFeedback] Malformed overall SingingScore data from AI:", parsedScore);
      throw new Error("Received malformed overall singing score data from AI.");
    }

    // Validate verseScores array and its elements
    if (!Array.isArray(parsedScore.verseScores)) {
      console.error("[geminiService.ts fetchSingingFeedback] 'verseScores' is missing or not an array:", parsedScore);
      // Attempt to provide a default empty array or handle as an error
      parsedScore.verseScores = []; // Provide a default to prevent crashes, but this is a data issue.
      // Or: throw new Error("'verseScores' array is missing in AI response.");
    } else {
      for (const verseScore of parsedScore.verseScores) {
        if (typeof verseScore.verseNumber !== 'number' ||
            typeof verseScore.pronunciationAccuracyScore !== 'number' ||
            typeof verseScore.timingAlignmentScore !== 'number' ||
            typeof verseScore.vocalClarityScore !== 'number' ||
            !verseScore.feedback ||
            !Array.isArray(verseScore.feedback.positive) ||
            !Array.isArray(verseScore.feedback.improvementAreas)) {
          console.error("[geminiService.ts fetchSingingFeedback] Malformed VerseSingingScore object in 'verseScores':", verseScore);
          // Potentially filter out malformed verse scores or throw an error
          // For now, we'll log and let it pass, but ideally, this should be stricter
        }
      }
    }

    console.log("[geminiService.ts fetchSingingFeedback] Singing feedback received and parsed successfully. Overall Score:", parsedScore.overallScore, "Verse Scores count:", parsedScore.verseScores.length);
    return parsedScore;

  } catch (e: any) {
    console.error("[geminiService.ts fetchSingingFeedback] Error fetching singing feedback from Gemini:", e);
     if (e instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response for singing feedback as JSON. Error: ${e.message}`);
    }
    throw new Error(`Failed to get singing feedback: ${e.message || 'Unknown Gemini processing error'}`);
  }
};
