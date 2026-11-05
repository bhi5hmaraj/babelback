import { GoogleGenAI } from '@google/genai';
import type { GenerateContentParameters, GetFileParameters, UploadFileParameters } from '@google/genai';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { singingScore, songData } from './song.ts';
import type { SingingScore, SongData } from './song.ts';
import type { Storage } from './storage.ts';

export const ANALYSIS_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'] as const;
export const ANALYSIS_PROMPT_VERSION = 'v1';

type GeminiFile = { name?: string; uri?: string; mimeType?: string; state?: string };
export type GeminiClient = {
  files: {
    upload(params: UploadFileParameters): Promise<GeminiFile>;
    get(params: GetFileParameters): Promise<GeminiFile>;
    delete(params: { name: string }): Promise<unknown>;
  };
  models: {
    generateContent(params: GenerateContentParameters): Promise<{ text?: string }>;
  };
};

export type AnalyzeSong = (input: {
  storageKey: string;
  title: string;
  contentType: string;
  language: string;
  model: string;
  karaoke: boolean;
}) => Promise<SongData>;

export type ScoreSinging = (input: {
  recordingKey: string;
  contentType: string;
  language: string;
  model: string;
  verses: SongData['verses'];
}) => Promise<SingingScore>;

export function connectSingingScorer(apiKey: string, storage: Storage): ScoreSinging {
  return createSingingScorer(new GoogleGenAI({ apiKey }), storage);
}

// A practice recording is a few lines long, so it goes inline instead of through the Files API.
export function createSingingScorer(client: GeminiClient, storage: Pick<Storage, 'read'>): ScoreSinging {
  return async ({ recordingKey, contentType, language, model, verses }) => {
    if (!ANALYSIS_MODELS.some((allowed) => allowed === model)) throw new Error('Unsupported scoring model');
    const audio = Buffer.from(await (await storage.read(recordingKey)).arrayBuffer()).toString('base64');
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: contentType, data: audio } },
        { text: singingFeedbackPrompt(language, verses) },
      ] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: z.toJSONSchema(singingScore, { target: 'openapi-3.0' }),
      },
    });
    return singingScore.parse(JSON.parse(response.text ?? ''));
  };
}

const clock = (seconds: number) => {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};

// Ported from the singing-feedback route (app/api/_lib/prompts.ts) of the old app.
export function singingFeedbackPrompt(language: string, verses: SongData['verses']) {
  const start = verses[0]?.startTime ?? 0;
  const references = verses.map((verse) => `Verse ${verse.verseNumber}: "${
    verse.transliterationSegments?.length ? verse.transliterationSegments.map((s) => s.text).join(' ') : verse.transliteration
  }"`).join('\n');
  const timings = verses.flatMap((verse) => verse.transliterationSegments?.length
    ? verse.transliterationSegments.map((s) => ({ text: s.text, startTime: clock(s.startTime - start), endTime: clock(s.endTime - start) }))
    : [{ text: `(Full transliteration V${verse.verseNumber}) ${verse.transliteration.slice(0, 30)}...`,
      startTime: clock(verse.startTime - start), endTime: clock(verse.endTime - start) }]);
  const guide = language === 'English'
    ? "the English-readable phonetic guide provided in each reference verse's transliterated text"
    : `the phonetic guide provided in each reference verse's transliterated text (which uses ${language} script)`;
  return `You are an expert multilingual singing coach for the language: ${language}.
The user has attempted to sing a sequence of song verses. Their recorded audio is provided.

The reference lyrics they were trying to sing, broken down by original verse number, are:
${references}

The expected relative timings for the finer sung phrases/segments within this ENTIRE sequence (format MM:SS.sss, relative to the start of the FIRST sung verse in the sequence) are:
${JSON.stringify(timings, null, 2)}

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
- Pronunciation evaluation for each verse is against ${guide} for that verse.
- Do NOT evaluate melodic pitch accuracy. Focus on pronunciation, timing, and clarity.
- Be encouraging and constructive in all feedback sections.
- If audio quality is too poor for analysis of a specific verse or overall, reflect this in scores (e.g., 0) and feedback.
- Adhere strictly to the JSON schema provided in the API call for the response structure.`;
}

export function connectSongAnalyzer(apiKey: string, storage: Storage): AnalyzeSong {
  return createSongAnalyzer(new GoogleGenAI({ apiKey }), storage);
}

export function createSongAnalyzer(
  client: GeminiClient,
  storage: Pick<Storage, 'read'>,
  wait: (ms: number) => Promise<unknown> = setTimeout,
): AnalyzeSong {
  return async ({ storageKey, title, contentType, language, model, karaoke }) => {
    if (!ANALYSIS_MODELS.some((allowed) => allowed === model)) throw new Error('Unsupported analysis model');
    const audio = await storage.read(storageKey);
    let file = await client.files.upload({ file: audio, config: { mimeType: contentType, displayName: title } });
    const name = file.name;
    if (!name) throw new Error('Gemini did not return an uploaded file');
    try {
      for (let poll = 0; file.state === 'PROCESSING' && poll < 60; poll++) {
        await wait(2000);
        file = await client.files.get({ name });
      }
      if (file.state !== 'ACTIVE' || !file.uri) throw new Error('Gemini could not process the audio');
      const response = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [
          { fileData: { fileUri: file.uri, mimeType: file.mimeType ?? contentType } },
          { text: `Analyse the entire song. Target language: ${language}. Filename: ${JSON.stringify(title)}.` },
        ] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: z.toJSONSchema(songData, { target: 'openapi-3.0' }),
          systemInstruction: analysisPrompt(language, karaoke),
        },
      });
      return songData.parse(JSON.parse(response.text ?? ''));
    } finally {
      await client.files.delete({ name }).catch((error: unknown) => {
        console.error('Gemini file cleanup failed', { name, error });
      });
    }
  };
}

function analysisPrompt(language: string, karaoke: boolean) {
  return `You are an expert multilingual music lyric analyst and translator.
Transcribe the entire audio and determine its original language. Divide it into verses, numbered from 1.
All startTime and endTime values are numbers in seconds from the start of the audio.
Provide translation, meaning, summary and detailedAnalysis in contemporary, natural ${language}.
Provide transliteration as a phonetic guide using ${language === 'English' ? 'English-readable Latin spellings, including when the original uses Latin script' : `the native script of ${language}`}.
${karaoke ? 'Include transliterationSegments and translationSegments in sung phrases of about 3-5 words, with matching timing.' : 'Include the original lyrics, translation, transliteration and meaning for each verse.'}
Infer the title when possible; otherwise use the filename.
For instrumental audio, use originalLanguage "Instrumental" and an empty verses array.
Return only JSON matching the supplied schema.`;
}
