
import { GoogleGenAI, GenerateContentResponse, Part, Type } from "@google/genai";
import { SongData, Language, Verse, SingingScore, RawSongData, RawVerse } from '../types';
import { getSongAnalysisSystemPrompt, getSongAnalysisUserPromptText, getSingingFeedbackPrompt, ReferenceVerseForPrompt } from './prompts';
import { parseSongVerses } from './verseParser';

let ai: GoogleGenAI | null = null;

export const initializeAiClient = (apiKey: string): void => {
  if (!apiKey) {
    console.error("[geminiService.ts initializeAiClient] Attempted to initialize with no API key. Gemini API functionality will be disabled.");
    ai = null; // Ensure ai is null if no key
    return;
  }
  if (ai) {
    // console.warn("[geminiService.ts initializeAiClient] AI client already initialized.");
    return;
  }
  try {
    ai = new GoogleGenAI({ apiKey });
    console.log("[geminiService.ts initializeAiClient] GoogleGenAI client initialized successfully.");
  } catch (error) {
    console.error("[geminiService.ts initializeAiClient] Failed to initialize GoogleGenAI client:", error);
    ai = null; // Ensure ai is null on initialization failure
  }
};

// --- Schema Definitions for Structured Output ---

const segmentSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: "Text content of the segment." },
    startTime: { type: Type.STRING, description: "Format: MM:SS.sss" },
    endTime: { type: Type.STRING, description: "Format: MM:SS.sss" },
  },
  required: ["text", "startTime", "endTime"],
  propertyOrdering: ["text", "startTime", "endTime"]
};

const getVerseSchemaProperties = (enableKaraokeMode: boolean) => {
  const baseProperties = {
    verseNumber: { type: Type.INTEGER, description: "Sequential verse number, starting from 1." },
    original: { type: Type.STRING, description: "Verbatim transcribed lyrics for this verse." },
    meaning: { type: Type.STRING, description: "Detailed explanation of the verse in the target language. Must be in the target language's native script and colloquial style." },
    startTime: { type: Type.STRING, description: "Start time of the verse, format MM:SS." },
    endTime: { type: Type.STRING, description: "End time of the verse, format MM:SS." },
  };
  if (enableKaraokeMode) {
    return {
      ...baseProperties,
      transliterationSegments: {
        type: Type.ARRAY,
        items: segmentSchema,
        description: "Array of sung phrases, transliterated phonetically. Each segment's 'text' follows transliteration rules. Timings are MM:SS.sss."
      },
      translationSegments: {
        type: Type.ARRAY,
        items: segmentSchema,
        description: "Array of sung phrases, translated into the target language's native script. Each segment's 'text' is colloquial. Timings MM:SS.sss, matching translit."
      },
    };
  }
  return {
    ...baseProperties,
    transliteration: { type: Type.STRING, description: "Full verse transliterated phonetically, following specific script rules." },
    translation: { type: Type.STRING, description: "Full verse translated into the target language's native script, colloquial style." },
  };
};

const getVerseSchemaRequiredFields = (enableKaraokeMode: boolean) => {
  const baseRequired = ["verseNumber", "original", "meaning", "startTime", "endTime"];
  return enableKaraokeMode
    ? [...baseRequired, "transliterationSegments", "translationSegments"]
    : [...baseRequired, "transliteration", "translation"];
};

const getVerseSchemaPropertyOrdering = (enableKaraokeMode: boolean) => {
  const baseOrdering = ["verseNumber", "original", "startTime", "endTime"];
  return enableKaraokeMode
    ? [...baseOrdering, "transliterationSegments", "translationSegments", "meaning"]
    : [...baseOrdering, "transliteration", "translation", "meaning"];
};


const getSongDataResponseSchema = (enableKaraokeMode: boolean) => ({
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Song title. Use filename placeholder if not discernible." },
    originalLanguage: { type: Type.STRING, description: "Detected language of the original lyrics. Use 'Instrumental' if no lyrics." },
    summary: { type: Type.STRING, description: "Summary of the song in the target language (native script, colloquial)." },
    detailedAnalysis: { type: Type.STRING, description: "Detailed analysis of the song in the target language (native script, colloquial)." },
    verses: {
      type: Type.ARRAY,
      description: "Array of verse objects. Empty if instrumental.",
      items: {
        type: Type.OBJECT,
        properties: getVerseSchemaProperties(enableKaraokeMode),
        required: getVerseSchemaRequiredFields(enableKaraokeMode),
        propertyOrdering: getVerseSchemaPropertyOrdering(enableKaraokeMode),
      }
    },
  },
  required: ["title", "originalLanguage", "summary", "detailedAnalysis", "verses"],
  propertyOrdering: ["title", "originalLanguage", "summary", "detailedAnalysis", "verses"]
});

const feedbackObjectSchema = {
    type: Type.OBJECT,
    properties: {
        positive: { type: Type.ARRAY, items: { type: Type.STRING, description: "Positive feedback point." }, description: "Array of positive feedback points." },
        improvementAreas: { type: Type.ARRAY, items: { type: Type.STRING, description: "Area for improvement." }, description: "Array of areas for improvement." }
    },
    required: ["positive", "improvementAreas"],
    propertyOrdering: ["positive", "improvementAreas"]
};

const verseScoreSchema = {
    type: Type.OBJECT,
    properties: {
        verseNumber: { type: Type.INTEGER, description: "The original verse number this score pertains to." },
        pronunciationAccuracyScore: { type: Type.NUMBER, description: "Score (0-100) for pronunciation accuracy for this verse." },
        timingAlignmentScore: { type: Type.NUMBER, description: "Score (0-100) for timing alignment for this verse." },
        vocalClarityScore: { type: Type.NUMBER, description: "Score (0-100) for vocal clarity for this verse." },
        feedback: feedbackObjectSchema,
        userAttemptTranscription: { type: Type.STRING, nullable: true, description: "Optional brief transcription of user's attempt for this verse." }
    },
    required: ["verseNumber", "pronunciationAccuracyScore", "timingAlignmentScore", "vocalClarityScore", "feedback"],
    propertyOrdering: ["verseNumber", "pronunciationAccuracyScore", "timingAlignmentScore", "vocalClarityScore", "userAttemptTranscription", "feedback"]
};

const getSingingFeedbackResponseSchema = () => ({
    type: Type.OBJECT,
    properties: {
        overallScore: { type: Type.NUMBER, description: "Overall score (0-100) for the entire performance." },
        pronunciationAccuracyScore: { type: Type.NUMBER, description: "Overall pronunciation accuracy score (0-100)." },
        timingAlignmentScore: { type: Type.NUMBER, description: "Overall timing alignment score (0-100)." },
        vocalClarityScore: { type: Type.NUMBER, description: "Overall vocal clarity score (0-100)." },
        feedback: feedbackObjectSchema, // Overall feedback
        userAttemptTranscription: { type: Type.STRING, nullable: true, description: "Optional brief overall transcription of user's attempt." },
        verseScores: {
            type: Type.ARRAY,
            items: verseScoreSchema,
            description: "Array of scores for each practiced verse."
        }
    },
    required: ["overallScore", "pronunciationAccuracyScore", "timingAlignmentScore", "vocalClarityScore", "feedback", "verseScores"],
    propertyOrdering: ["overallScore", "pronunciationAccuracyScore", "timingAlignmentScore", "vocalClarityScore", "userAttemptTranscription", "feedback", "verseScores"]
});


// --- Utility Functions ---
const formatSecondsToMMSSsss = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((totalSeconds - (minutes * 60) - seconds) * 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]); 
      } else {
        reject(new Error("[geminiService.ts blobToBase64] Failed to read blob as base64 string."));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

function sanitizeForJsonParse(jsonString: string): string {
  let sanitized = jsonString.replace(/\r\n/g, '\\n');
  sanitized = sanitized.replace(/\n/g, '\\n');
  sanitized = sanitized.replace(/\r/g, '\\r');
  sanitized = sanitized.replace(/\t/g, '\\t');
  sanitized = sanitized.replace(/\\(?![bfnrt"\\/u])/g, '\\\\');
  return sanitized;
}

// --- API Service Functions ---

export const fetchSongDataFromGemini = async (
  audioFile: File,
  targetLanguage: Language,
  enableKaraokeMode: boolean,
  modelId: string,
  onProgress?: (message: string) => void
): Promise<SongData> => {
  if (!ai) {
    console.error("[geminiService.ts fetchSongDataFromGemini] Gemini API client not initialized.");
    throw new Error("Gemini API client is not initialized. Ensure API key is set and client is initialized.");
  }
  if (!modelId) {
    console.error("[geminiService.ts fetchSongDataFromGemini] Model ID not provided.");
    throw new Error("AI Model ID is required for processing.");
  }

  let uploadedFileUri: string | undefined;
  let uploadedFileMimeType: string | undefined;

  try {
    if (onProgress) onProgress("Securely uploading your audio...");
    const uploadResult = await ai.files.upload({
        file: audioFile,
        config: { mimeType: audioFile.type || 'audio/mp3' },
    });
    uploadedFileUri = uploadResult.uri;
    uploadedFileMimeType = uploadResult.mimeType;

    if (!uploadedFileUri || !uploadedFileMimeType) {
        console.error("[geminiService.ts fetchSongDataFromGemini] File upload failed: 'uri' or 'mimeType' missing.", uploadResult);
        throw new Error("Audio file upload failed: Essential file details missing.");
    }
    if (onProgress) onProgress("Upload complete! Awakening the AI lyricist...");
  } catch (uploadError: any) {
    console.error("[geminiService.ts fetchSongDataFromGemini] Error during file upload:", uploadError);
    throw new Error(`Failed to upload audio file: ${uploadError.message || 'Unknown upload error'}`);
  }

  const userPromptText = getSongAnalysisUserPromptText(targetLanguage, audioFile.name, enableKaraokeMode);
  const parts: Part[] = [
    { fileData: { mimeType: uploadedFileMimeType, fileUri: uploadedFileUri } },
    { text: userPromptText },
  ];

  const systemInstruction = getSongAnalysisSystemPrompt(targetLanguage, enableKaraokeMode, audioFile.name);
  const responseSchema = getSongDataResponseSchema(enableKaraokeMode);
  let geminiApiResponse: GenerateContentResponse | undefined;
  let rawResponseTextForDebugging = "";

  try {
    if (onProgress) onProgress("AI is listening carefully to the music...");
    geminiApiResponse = await ai.models.generateContent({
      model: modelId,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: systemInstruction,
      }
    });

    if (onProgress) onProgress("AI has spoken! Interpreting the lyrical scrolls...");
    if (!geminiApiResponse) {
      console.error("[geminiService.ts fetchSongDataFromGemini] No response from Gemini API.");
      throw new Error("No response received from Gemini API.");
    }

    rawResponseTextForDebugging = geminiApiResponse.text;
    let jsonStr = geminiApiResponse.text.trim();
    // With responseSchema, markdown fences should not appear, but keep for safety.
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const matchFence = jsonStr.match(fenceRegex);
    if (matchFence && matchFence[1]) {
      jsonStr = matchFence[1].trim();
    }
    
    // With responseSchema, the response should be valid JSON.
    // However, if sanitization is still needed for subtle issues, it can be applied.
    // For now, let's trust responseSchema and reduce reliance on sanitizeForJsonParse.
    // jsonStr = sanitizeForJsonParse(jsonStr); 
    
    if (onProgress) onProgress("Translating and analyzing insights...");
    const parsedData = JSON.parse(jsonStr) as Partial<RawSongData>;

    if (!parsedData.title || typeof parsedData.title !== 'string' ||
        !parsedData.originalLanguage || typeof parsedData.originalLanguage !== 'string' ||
        !parsedData.summary || typeof parsedData.summary !== 'string' ||
        !parsedData.detailedAnalysis || typeof parsedData.detailedAnalysis !== 'string' ||
        !parsedData.verses || !Array.isArray(parsedData.verses)) {
      console.error("[geminiService.ts fetchSongDataFromGemini] Parsed data missing required fields or types:", parsedData);
      throw new Error("Received malformed song data from AI despite schema.");
    }
    
    const finalVerses: Verse[] = parseSongVerses(parsedData.verses as RawVerse[], enableKaraokeMode, targetLanguage, onProgress);

    if (parsedData.verses.length === 0 && parsedData.originalLanguage !== "Instrumental") {
        console.warn("[geminiService.ts fetchSongDataFromGemini] AI returned empty verses array but not marked Instrumental.");
    }
    
    if (onProgress) onProgress("Almost there! Finalizing results...");
    const finalSongData: SongData = {
        title: parsedData.title,
        originalLanguage: parsedData.originalLanguage,
        summary: parsedData.summary,
        detailedAnalysis: parsedData.detailedAnalysis,
        verses: finalVerses
    };

    console.log("[geminiService.ts fetchSongDataFromGemini] Song data processing complete. Title:", finalSongData.title);
    return finalSongData;

  } catch (e: any) {
    console.error("[geminiService.ts fetchSongDataFromGemini] Error fetching/parsing song data:", e);
    const responseTextPreview = rawResponseTextForDebugging.substring(0, 10000) ?? "No response text captured.";
    
    let errorDetails = "";
    if (e instanceof SyntaxError && e.message.includes("JSON")) {
        const matchPosition = e.message.match(/position (\d+)/);
        let errorPosition = -1;
        if (matchPosition) errorPosition = parseInt(matchPosition[1], 10);
        
        if (errorPosition !== -1 && rawResponseTextForDebugging) {
            const contextChars = 200;
            const startContext = Math.max(0, errorPosition - contextChars);
            const endContext = Math.min(rawResponseTextForDebugging.length, errorPosition + contextChars);
            const contextSnippet = rawResponseTextForDebugging.substring(startContext, endContext)
                                     .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
            errorDetails = `\nContext around error (approx. position ${errorPosition}):\n"${contextSnippet}"`;
        }
        throw new Error(`Failed to parse AI response as JSON. Error: ${e.message}. Response (first 10KB): "${responseTextPreview}..."${errorDetails}`);
    }
    throw new Error(`Failed to process song: ${e.message || 'Unknown Gemini error'}. Response preview: "${responseTextPreview}..."`);
  }
};


export const fetchSingingFeedback = async (
  audioBlob: Blob,
  referenceVerses: Verse[],
  targetLanguage: Language,
  modelId: string
): Promise<SingingScore> => {
  if (!ai) {
    console.error("[geminiService.ts fetchSingingFeedback] Gemini API client not initialized.");
    throw new Error("Gemini API client is not initialized for singing feedback.");
  }
  if (!referenceVerses || referenceVerses.length === 0) {
    throw new Error("No reference verses provided for singing feedback.");
  }
  if (!modelId) {
    throw new Error("AI Model ID is required for singing feedback.");
  }
  let rawResponseTextForDebugging = "";

  try {
    const audioBase64 = await blobToBase64(audioBlob);

    const referenceVersesInfoForPrompt: ReferenceVerseForPrompt[] = referenceVerses.map(verse => ({
      originalVerseNumber: verse.verseNumber,
      transliteratedText: verse.transliterationSegments && verse.transliterationSegments.length > 0
        ? verse.transliterationSegments.map(s => s.text).join(' ')
        : verse.transliteration || "(Transliteration not available for this verse)",
    }));

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
         referenceSegmentTimingsData.push({
            text: `(Full translit. V${verse.verseNumber}) ${verse.transliteration.substring(0,30)}...`,
            startTime: formatSecondsToMMSSsss(Math.max(0, verse.startTime - baseStartTimeForRelativeCalc)),
            endTime: formatSecondsToMMSSsss(Math.max(0, verse.endTime - baseStartTimeForRelativeCalc))
         });
      }
    });
    const referenceSegmentTimingsJson = JSON.stringify(referenceSegmentTimingsData, null, 2);

    const promptText = getSingingFeedbackPrompt(targetLanguage, referenceVersesInfoForPrompt, referenceSegmentTimingsJson);
    const responseSchema = getSingingFeedbackResponseSchema();

    const parts: Part[] = [
      { inlineData: { mimeType: audioBlob.type || 'audio/webm', data: audioBase64 } },
      { text: promptText },
    ];

    const geminiApiResponse = await ai.models.generateContent({
      model: modelId,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    if (!geminiApiResponse || !geminiApiResponse.text) {
      throw new Error("No response or empty response text from Gemini API for singing feedback.");
    }
    
    rawResponseTextForDebugging = geminiApiResponse.text;
    let jsonStr = geminiApiResponse.text.trim();
    // Markdown fences should not be present with responseSchema.
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const matchFence = jsonStr.match(fenceRegex);
    if (matchFence && matchFence[1]) {
      jsonStr = matchFence[1].trim();
    }
    // jsonStr = sanitizeForJsonParse(jsonStr); // Likely not needed with responseSchema

    const parsedScore = JSON.parse(jsonStr) as SingingScore;

    // Basic validation of the parsed structure based on schema expectations
    if (typeof parsedScore.overallScore !== 'number' ||
        typeof parsedScore.pronunciationAccuracyScore !== 'number' ||
        !parsedScore.feedback || !Array.isArray(parsedScore.feedback.positive) ||
        !Array.isArray(parsedScore.verseScores)) {
      console.error("[geminiService.ts fetchSingingFeedback] Malformed SingingScore from AI despite schema:", parsedScore);
      throw new Error("Received malformed singing score data from AI.");
    }
    for (const vs of parsedScore.verseScores) {
        if (typeof vs.verseNumber !== 'number' || typeof vs.pronunciationAccuracyScore !== 'number') {
             console.error("[geminiService.ts fetchSingingFeedback] Malformed VerseSingingScore in array:", vs);
             // Potentially filter out malformed verse scores or throw a more specific error
        }
    }

    console.log(`[geminiService.ts fetchSingingFeedback] Feedback (model ${modelId}) parsed. Overall: ${parsedScore.overallScore}`);
    return parsedScore;

  } catch (e: any) {
    console.error("[geminiService.ts fetchSingingFeedback] Error fetching singing feedback:", e);
    const responseTextPreview = rawResponseTextForDebugging.substring(0, 10000) ?? "No response text captured.";
    let errorDetails = "";
    if (e instanceof SyntaxError && e.message.includes("JSON")) {
        const matchPosition = e.message.match(/position (\d+)/);
        let errorPosition = -1;
        if (matchPosition) errorPosition = parseInt(matchPosition[1], 10);
        
        if (errorPosition !== -1 && rawResponseTextForDebugging) {
            const contextChars = 200;
            const startContext = Math.max(0, errorPosition - contextChars);
            const endContext = Math.min(rawResponseTextForDebugging.length, errorPosition + contextChars);
            const contextSnippet = rawResponseTextForDebugging.substring(startContext, endContext)
                                     .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
            errorDetails = `\nContext around error (approx. pos ${errorPosition}):\n"${contextSnippet}"`;
        }
        throw new Error(`Failed to parse AI feedback as JSON. Error: ${e.message}. Response (first 10KB): "${responseTextPreview}..."${errorDetails}`);
    }
    throw new Error(`Failed to get singing feedback: ${e.message || 'Unknown error'}. Response: "${responseTextPreview}..."`);
  }
};
