
import { Language, Verse } from '../types';

// Helper for transliteration instruction, exported for potential re-use or clarity if needed elsewhere,
// but primarily used internally by getSongAnalysisSystemPrompt.
export const getTransliterationScriptInstruction = (targetLanguage: Language): string => {
  // console.log('[prompts.ts getTransliterationScriptInstruction] Generating for target language:', targetLanguage);
  if (targetLanguage === Language.ENGLISH) {
    return `as a phonetic guide for an English speaker, using simplified English-readable spellings (Latin script).
    **IMPORTANT**: If the original language also uses Latin script (e.g., Spanish, German, French), **DO NOT simply copy the original text**. You MUST transform it into a phonetic spelling that an English speaker can readily pronounce.
    For example:
    - Original Spanish: 'Y la presión se siente espera en ti tu gente'
      English Phonetic Transliteration: 'Ee lah preh-see-OHN seh see-EN-teh es-PEH-rah en tee too HEN-teh'
    - Original German: 'Ich liebe dich'
      English Phonetic Transliteration: 'Ish LEE-buh dish'
    - Original Spanish phrase 'Porque esto es África'
      English Phonetic Transliteration: 'Por-keh ES-toh es AH-free-kah'
    - Original phrase from a non-Latin script language (like 'Tsamina mina zangalewa' from Fang) present in the lyrics
      English Phonetic Transliteration: 'Tsa-MEE-na MEE-na zan-GAH-leh-wa'
    - If an original English phrase is 'Hello world', it can remain 'Hello world'.
    Focus on phonetic clarity FOR AN ENGLISH SPEAKER. Break down words into pronounceable syllables if needed.`;
  }
  return `written using the NATIVE SCRIPT of '${targetLanguage}'. For example, if 'original' is "Hello world" (English) and '${targetLanguage}' is Hindi, 'text' should be like "हेलो वर्ल्ड".`;
};


export const getSongAnalysisSystemPrompt = (
  targetLanguage: Language,
  enableKaraokeMode: boolean,
  audioFileName: string
): string => {
  // console.log('[prompts.ts getSongAnalysisSystemPrompt] Generating with params:', { targetLanguage, enableKaraokeMode, audioFileName });

  const transliterationScriptInstruction = getTransliterationScriptInstruction(targetLanguage);

  const karaokeInstructions = `
c. 'transliterationSegments': REQUIRED. Array of objects for SUNG PHRASES from 'original' lyrics.
   - Each 'text' field in 'transliterationSegments' MUST be the phonetic representation of the original sung phrase, ${transliterationScriptInstruction}.
   - A "sung phrase" is typically 3-5 words (can be 2-7) melodically connected.
   - **CRITICAL**: Group words into natural sung phrases. **STRICTLY AVOID single-word segments** unless sung in isolation with clear pauses.
   - Each object: { 'text': string, 'startTime': "MM:SS.sss", 'endTime': "MM:SS.sss" }.
d. 'translationSegments': REQUIRED. Array of objects for TRANSLATED SUNG PHRASES (into ${targetLanguage} native script).
   - Each 'translationSegment' MUST correspond EXACTLY in timing and phrasing to a 'transliterationSegment'.
   - The 'text' is the translation of the phrase from the corresponding 'transliterationSegment', written in ${targetLanguage} native script.
   - Each object: { 'text': string, 'startTime': "MM:SS.sss", 'endTime': "MM:SS.sss" }. Timings MUST match corresponding transliterationSegment.
e. 'meaning': DETAILED explanation of the 'translation' (the translated verse in ${targetLanguage}).
If Karaoke Mode is NOT active, provide 'transliteration' (single string, phonetically representing original lyrics as per the rule above) and 'translation' (single string) per verse instead of 'transliterationSegments' and 'translationSegments'.
`;

  const standardTransliterationInstruction = `
c. 'transliteration': Phonetic representation of 'original' lyrics, ${transliterationScriptInstruction}.
d. 'translation': Full translation of the verse into ${targetLanguage} native script.
e. 'meaning': DETAILED explanation of the 'translation' (the translated verse in ${targetLanguage}).
`;

const fullPrompt = `You are an expert multilingual music lyric analyst and translator.
Process the entire audio file. Transcribe lyrics ('original'), determine original language, segment into verses.
For each verse, provide 'startTime' and 'endTime' ("MM:SS").
For each verse, also provide:
    a. 'original': Verbatim transcribed lyrics.
    ${enableKaraokeMode ? karaokeInstructions : standardTransliterationInstruction}
Provide 'summary' and 'detailedAnalysis' in ${targetLanguage} native script.

Respond ONLY with valid JSON (no markdown \`\`\`json). Structure:
{
  "title": "Song Title",
  "originalLanguage": "Detected language",
  "summary": "Summary...",
  "detailedAnalysis": "Analysis...",
  "verses": [
    {
      "verseNumber": 1,
      "original": "Original phrase one, original phrase two.",
      "startTime": "00:00",
      "endTime": "00:15",
      ${enableKaraokeMode
        ? `"transliterationSegments": [
             { "text": "Phonetic phrase 1 (per instruction)", "startTime": "00:01.123", "endTime": "00:03.456" },
             { "text": "Phonetic phrase 2 (per instruction)", "startTime": "00:03.500", "endTime": "00:05.900" }
           ],
           "translationSegments": [
             { "text": "Translated phrase 1 (in ${targetLanguage})", "startTime": "00:01.123", "endTime": "00:03.456" },
             { "text": "Translated phrase 2 (in ${targetLanguage})", "startTime": "00:03.500", "endTime": "00:05.900" }
           ],`
        : `"transliteration": "Full verse phonetic transliteration (per instruction)...",
           "translation": "Full verse translation (in ${targetLanguage})...",`}
      "meaning": "Meaning (in ${targetLanguage})..."
    }
  ]
}

GUIDELINES:
- 'title': If discernible from lyrics or common knowledge about the file; otherwise, use a placeholder based on "${audioFileName}".
- Verse 'startTime'/'endTime': "MM:SS".
- If Karaoke:
    - 'transliterationSegments' & 'translationSegments' 'startTime'/'endTime': "MM:SS.sss".
    - Segments are sung phrases (3-5 words). AVOID single words.
    - 'transliterationSegments.text' MUST follow the specific transliteration instruction provided (considering target language script and phonetic guidance for English speakers if target is English).
- All user-facing text (translation, meaning, summary, analysis): ${targetLanguage} native script.
- Instrumental: "originalLanguage": "Instrumental", "summary": "Instrumental.", "detailedAnalysis": "N/A.", "verses": [].
- "verseNumber" sequential from 1. All fields mandatory based on Karaoke Mode.
`;
  // console.log('[prompts.ts getSongAnalysisSystemPrompt] Generated prompt length:', fullPrompt.length);
  return fullPrompt;
};


export interface ReferenceVerseForPrompt {
  originalVerseNumber: number;
  transliteratedText: string; // Full transliteration of this verse
  // Relative start/end times of this verse within the practiced segment can be included if helpful for AI
  // For now, we're passing segment timings separately in referenceRelativeTimingsJson
}

export const getSingingFeedbackPrompt = (
  targetLanguage: Language,
  referenceVersesInfo: ReferenceVerseForPrompt[], // Changed from fullReferenceSegmentsText
  referenceSegmentTimingsJson: string // JSON string of segment-level timings if available
): string => {
  const isTargetEnglish = targetLanguage === Language.ENGLISH;
  const pronunciationGuidance = isTargetEnglish
    ? "the English-readable phonetic guide provided in each reference verse's transliterated text"
    : `the phonetic guide provided in each reference verse's transliterated text (which uses ${targetLanguage} script)`;

  const referenceVersesStringForPrompt = referenceVersesInfo.map(v =>
    `Verse ${v.originalVerseNumber}: "${v.transliteratedText}"`
  ).join('\n');

  const fullPrompt = `
You are an expert multilingual singing coach for the language: ${targetLanguage}.
The user has attempted to sing a sequence of song verses. Their recorded audio is provided.

The reference lyrics they were trying to sing, broken down by original verse number, are:
${referenceVersesStringForPrompt}

The expected relative timings for the finer sung phrases/segments within this ENTIRE sequence (format MM:SS.sss, relative to the start of the FIRST sung verse in the sequence) are:
${referenceSegmentTimingsJson && referenceSegmentTimingsJson.length > 2 ? referenceSegmentTimingsJson : "No specific sub-verse phrase timings available. Evaluate based on overall verse flow and the provided reference verse texts."}

Your task is to:
1. Analyze the user's audio against the provided reference texts for EACH verse in the sequence.
2. Provide an "overallScore" (0-100), "pronunciationAccuracyScore" (overall), "timingAlignmentScore" (overall), and "vocalClarityScore" (overall). These overall scores reflect the entire performance across all practiced verses.
3. Provide overall "feedback" (positive and improvementAreas) for the entire performance.
4. For EACH reference verse provided above, you MUST provide a corresponding entry in a "verseScores" array. Each entry in "verseScores" should include:
    - "verseNumber": The original verse number (e.g., if the user sang original verses 3 and 4, you'd have entries for verseNumber: 3 and verseNumber: 4).
    - "pronunciationAccuracyScore": Score (0-100) for this specific verse.
    - "timingAlignmentScore": Score (0-100) for this specific verse.
    - "vocalClarityScore": Score (0-100) for this specific verse.
    - "feedback": An object with "positive" (array of strings) and "improvementAreas" (array of strings) specific to this verse.
    - "userAttemptTranscription": (Optional) A brief transcription of what the user actually sang for THIS VERSE.

Respond ONLY with a valid JSON object (no markdown \`\`\`json). Structure:
{
  "overallScore": number,
  "pronunciationAccuracyScore": number, // Overall
  "timingAlignmentScore": number,     // Overall
  "vocalClarityScore": number,        // Overall
  "feedback": { // Overall feedback
    "positive": [string, string],
    "improvementAreas": [string, string]
  },
  "userAttemptTranscription": "string (optional, brief OVERALL transcription if useful)",
  "verseScores": [
    {
      "verseNumber": number, // e.g., 3 (original verse number)
      "pronunciationAccuracyScore": number,
      "timingAlignmentScore": number,
      "vocalClarityScore": number,
      "feedback": {
        "positive": [string],
        "improvementAreas": [string]
      },
      "userAttemptTranscription": "string (optional, transcription for THIS verse)"
    }
    // ... more objects for other practiced verses
  ]
}

GUIDELINES:
- The "verseNumber" in "verseScores" MUST match the original verse numbers from the reference.
- Pronunciation evaluation for each verse is against ${pronunciationGuidance} for that verse.
- Do NOT evaluate melodic pitch accuracy. Focus on pronunciation, timing, and clarity.
- Be encouraging and constructive in all feedback sections.
- If audio quality is too poor for analysis of a specific verse or overall, reflect this in scores (e.g., 0) and feedback.
`;
  return fullPrompt;
};
