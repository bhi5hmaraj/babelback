import { GoogleGenAI } from '@google/genai';
import type { GenerateContentParameters, GetFileParameters, UploadFileParameters } from '@google/genai';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { songData } from './song.ts';
import type { SongData } from './song.ts';
import type { Storage } from './storage.ts';

export const ANALYSIS_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'] as const;
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
