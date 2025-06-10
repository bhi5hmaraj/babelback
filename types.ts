
export enum Language {
  ENGLISH = "English",
  HINDI = "Hindi",
  TAMIL = "Tamil",
  TELUGU = "Telugu",
  BENGALI = "Bengali",
}

export interface TransliterationSegment {
  text: string;
  startTime: number; // Start time of the segment in seconds (from MM:SS.sss)
  endTime: number;   // End time of the segment in seconds (from MM:SS.sss)
}

export interface TranslationSegment {
  text: string;
  startTime: number; // Start time of the segment in seconds (from MM:SS.sss), synced with transliteration
  endTime: number;   // End time of the segment in seconds (from MM:SS.sss), synced with transliteration
}

export interface Verse {
  verseNumber: number;
  original: string; // Lyrics in original language (transcribed by AI from audio)
  translation: string; // Translated to targetLanguage (fallback or full text)
  transliteration: string; // Transliteration of original lyrics (fallback or full text)
  transliterationSegments?: TransliterationSegment[]; // Word-level transliteration for Karaoke mode
  translationSegments?: TranslationSegment[]; // Word-level translation for Karaoke mode, synced with transliteration
  meaning: string; // Meaning in targetLanguage
  startTime: number; // Start time of the verse in seconds
  endTime: number; // End time of the verse in seconds
}

export interface SongData {
  title: string; // Song title (from AI, or filename if not discernible)
  originalLanguage: string; // The language AI detected/used for 'original' transcribed lyrics
  summary: string; // AI-generated summary of the song in the target language
  detailedAnalysis: string; // AI-generated detailed analysis of the entire song in the target language
  verses: Verse[];
}

export interface PanelVisibility {
  lyrics: boolean; // Changed from 'transliteration' to 'lyrics' for combined view
  meaning: boolean;
}

export interface LibraryEntry {
  id: number; // Auto-incremented primary key from IndexedDB
  title: string;
  originalLanguage: string;
  targetLanguage: Language; // The language used for this specific analysis
  timestamp: number; // Date.now() when added
  audioFileBlob: Blob; // The actual audio file content (File is a Blob)
  audioFileName: string;
  audioFileType: string;
  songData: SongData; // The full AI analysis associated with this audio and target language
  processingTimeSeconds?: number; // Time taken by AI to process the song
  songDurationSeconds?: number;   // Total duration of the audio file
}

// For Singing Practice Mode

export interface VerseSingingScore {
  verseNumber: number; // Corresponds to the original verse number in SongData
  pronunciationAccuracyScore: number;
  timingAlignmentScore: number;
  vocalClarityScore: number;
  feedback: { // Specific feedback for this verse
    positive: string[];
    improvementAreas: string[];
  };
  userAttemptTranscription?: string; // Transcription of user's attempt for this verse
}

export interface SingingScore {
  overallScore: number;
  pronunciationAccuracyScore: number; // Overall/Average
  timingAlignmentScore: number;     // Overall/Average
  vocalClarityScore: number;        // Overall/Average
  feedback: { // General feedback for the entire performance
    positive: string[];
    improvementAreas: string[];
  };
  userAttemptTranscription?: string; // Overall transcription, if applicable, or for a key segment
  verseScores: VerseSingingScore[]; // Array of scores for each practiced verse
}

export enum PracticeModeStatus {
  IDLE = 'idle',
  REQUESTING_CONSENT = 'requesting_consent',
  CONSENT_GIVEN = 'consent_given', // User has given consent, ready for any verse
  READY_TO_RECORD = 'ready_to_record', // Specific verse selected, ready for user to hit record
  RECORDING = 'recording',
  AWAITING_REVIEW = 'awaiting_review', // User has recorded, can listen and decide to submit or re-record
  PROCESSING_AUDIO = 'processing_audio', // Preparing for AI (this might be short or merged with SCORING)
  SCORING = 'scoring', // Sent to AI, awaiting score
  SHOWING_SCORE = 'showing_score',
  ERROR = 'error'
}

// For Audio Device Selection
export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}
