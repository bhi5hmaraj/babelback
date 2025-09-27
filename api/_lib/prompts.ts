export enum Language {
  ENGLISH = 'English',
  HINDI = 'Hindi',
  TAMIL = 'Tamil',
  TELUGU = 'Telugu',
  BENGALI = 'Bengali',
}

export const getTransliterationScriptInstruction = (targetLanguage: Language): string => {
  if (targetLanguage === Language.ENGLISH) {
    return `as a phonetic guide for an English speaker, using simplified English-readable spellings (Latin script).
    IMPORTANT: If the original language also uses Latin script (e.g., Spanish, German, French), DO NOT simply copy the original text. You MUST transform it into a phonetic spelling that an English speaker can readily pronounce.
    Examples:
    - Spanish: 'Y la presión se siente espera en ti tu gente' → 'Ee lah preh-see-OHN seh see-EN-teh es-PEH-rah en tee too HEN-teh'
    - German: 'Ich liebe dich' → 'Ish LEE-buh dish'
    - Spanish phrase 'Porque esto es África' → 'Por-keh ES-toh es AH-free-kah'
    - If original English is 'Hello world', it can remain 'Hello world'.
    Focus on phonetic clarity FOR AN ENGLISH SPEAKER. Break down words into pronounceable syllables if needed.`;
  }
  return `written using the NATIVE SCRIPT of '${targetLanguage}'. For example, if 'original' is "Hello world" (English) and '${targetLanguage}' is Hindi, 'text' should be like "हेलो वर्ल्ड".`;
};

export const getSongAnalysisSystemPrompt = (
  targetLanguage: Language,
  enableKaraokeMode: boolean,
  audioFileName: string
): string => {
  const transliterationScriptInstruction = getTransliterationScriptInstruction(targetLanguage);
  const contemporaryLanguageInstruction = `Use a colloquial, contemporary, and natural-sounding style for all ${targetLanguage} text, as if explaining to a friend. Avoid overly formal or archaic language.`;

  const karaokeGuidance = `
For 'transliterationSegments':
   - Each 'text' field MUST be the phonetic representation of the original sung phrase, ${transliterationScriptInstruction}.
   - A "sung phrase" is typically 3-5 words (can be 2-7) melodically connected.
   - CRITICAL: Group words into natural sung phrases. STRICTLY AVOID single-word segments unless sung in isolation with clear pauses.
   - Ensure 'startTime' and 'endTime' are in "MM:SS.sss" format.
For 'translationSegments':
   - Each 'translationSegment' MUST correspond EXACTLY in timing and phrasing to a 'transliterationSegment'.
   - The 'text' is the translation of the phrase from the corresponding 'transliterationSegment', written in ${targetLanguage} native script. ${contemporaryLanguageInstruction}
   - Ensure 'startTime' and 'endTime' are in "MM:SS.sss" format and match corresponding transliterationSegment.
For 'meaning' (per verse): Provide a DETAILED explanation of the 'translation' (the translated verse in ${targetLanguage}). The explanation itself should be in ${targetLanguage}. ${contemporaryLanguageInstruction}`;

  const standardGuidance = `
For 'transliteration' (per verse): Provide a phonetic representation of 'original' lyrics, ${transliterationScriptInstruction}.
For 'translation' (per verse): Provide a full translation of the verse into ${targetLanguage} native script. ${contemporaryLanguageInstruction}
For 'meaning' (per verse): Provide a DETAILED explanation of the 'translation' (the translated verse in ${targetLanguage}). The explanation itself should be in ${targetLanguage}. ${contemporaryLanguageInstruction}`;

  const fullPrompt = `You are an expert multilingual music lyric analyst and translator.
Process the entire audio file. Transcribe lyrics ('original'), determine original language, segment into verses.
For each verse, provide 'startTime' and 'endTime' in "MM:SS" format.
Additionally, for each verse, provide the content for 'original' and other fields as per the response schema and the specific guidance below.

${enableKaraokeMode ? karaokeGuidance : standardGuidance}

For 'summary' and 'detailedAnalysis' (overall song): Provide these in ${targetLanguage} native script, following: ${contemporaryLanguageInstruction}

GUIDELINES:
- 'title': If discernible from lyrics or common knowledge about the file; otherwise, use a placeholder based on "${audioFileName}".
- All user-facing text (translation, meaning, summary, analysis): Must be in ${targetLanguage} native script and adhere to the contemporary and colloquial style requested.
- Instrumental tracks: Set "originalLanguage" to "Instrumental", "summary" to "Instrumental.", "detailedAnalysis" to "N/A.", and "verses" to an empty array.
- "verseNumber" should be sequential, starting from 1. All fields defined in the schema are mandatory unless specified as nullable/optional in the schema.
- Adhere strictly to the JSON schema provided in the API call for the response structure. Your primary role is to populate the fields of this schema with high-quality content.`;
  return fullPrompt;
};

export const getSongAnalysisUserPromptText = (
  targetLanguage: Language,
  audioFileName: string,
  enableKaraokeMode: boolean
): string => {
  return `Target Language for all user-facing text outputs (translation, transliteration, meaning, summary, detailed analysis): ${targetLanguage}.
Original filename (for reference if title is not discernible): "${audioFileName}".
Karaoke Mode Active: ${enableKaraokeMode}.
The provided audio file should be processed in its entirety.
Please analyze this complete audio file according to the system instructions and populate the fields of the provided response schema.`;
};

export interface ReferenceVerseForPrompt {
  originalVerseNumber: number;
  transliteratedText: string;
}

export const getSingingFeedbackPrompt = (
  targetLanguage: Language,
  referenceVersesInfo: ReferenceVerseForPrompt[],
  referenceSegmentTimingsJson: string
): string => {
  const isTargetEnglish = targetLanguage === Language.ENGLISH;
  const pronunciationGuidance = isTargetEnglish
    ? 'the English-readable phonetic guide provided in each reference verse\'s transliterated text'
    : `the phonetic guide provided in each reference verse\'s transliterated text (which uses ${targetLanguage} script)`;

  const referenceVersesStringForPrompt = referenceVersesInfo
    .map((v) => `Verse ${v.originalVerseNumber}: "${v.transliteratedText}"`)
    .join('\n');

  const fullPrompt = `You are an expert multilingual singing coach for the language: ${targetLanguage}.
The user has attempted to sing a sequence of song verses. Their recorded audio is provided.

The reference lyrics they were trying to sing, broken down by original verse number, are:
${referenceVersesStringForPrompt}

The expected relative timings for the finer sung phrases/segments within this ENTIRE sequence (format MM:SS.sss, relative to the start of the FIRST sung verse in the sequence) are:
${referenceSegmentTimingsJson && referenceSegmentTimingsJson.length > 2 ? referenceSegmentTimingsJson : 'No specific sub-verse phrase timings available. Evaluate based on overall verse flow and the provided reference verse texts.'}

Your task is to analyze the user's audio and provide feedback by populating the fields of the JSON schema provided in the API call.

GUIDELINES FOR POPULATING THE SCHEMA:
- "overallScore": Score (0-100) reflecting the entire performance across all practiced verses.
- "pronunciationAccuracyScore", "timingAlignmentScore", "vocalClarityScore": Overall scores (0-100) for the entire performance.
- "feedback" (overall): Provide "positive" and "improvementAreas" string arrays for the entire performance.
- "userAttemptTranscription" (overall, optional): A brief transcription of what the user actually sang overall, if distinct or useful.
- "verseScores" array: For EACH reference verse provided above, create a corresponding object in this array.
    - "verseNumber": The original verse number.
    - "pronunciationAccuracyScore", "timingAlignmentScore", "vocalClarityScore": Scores (0-100) for this specific verse.
    - "feedback" (verse-specific): Provide "positive" and "improvementAreas" string arrays for this verse.
    - "userAttemptTranscription" (verse-specific, optional): A brief transcription of what the user sang for THIS VERSE.
- The "verseNumber" in "verseScores" MUST match the original verse numbers from the reference.
- Pronunciation evaluation for each verse is against ${pronunciationGuidance} for that verse.
- Do NOT evaluate melodic pitch accuracy. Focus on pronunciation, timing, and clarity.
- Be encouraging and constructive in all feedback sections.
- If audio quality is too poor for analysis of a specific verse or overall, reflect this in scores (e.g., 0) and feedback.
- Adhere strictly to the JSON schema provided in the API call for the response structure.`;
  return fullPrompt;
};
