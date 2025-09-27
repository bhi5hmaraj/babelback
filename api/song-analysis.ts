import { GenerateContentResponse, Part, Type } from '@google/genai';
import { Buffer } from 'node:buffer';
import { getGeminiClient, resolveModelId } from './_lib/gemini';
import { getSongAnalysisSystemPrompt, getSongAnalysisUserPromptText } from '../services/prompts';
import { parseSongVerses } from '../services/verseParser';
import { Language, RawSongData, RawVerse, SongData, Verse } from '../types';

interface VercelRequest {
  method?: string;
  body?: unknown;
}

interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
}

interface SongAnalysisRequestBody {
  audioBase64: string;
  fileName?: string;
  mimeType?: string;
  targetLanguage: Language | string;
  enableKaraokeMode: boolean;
  modelId?: string;
}

interface SongAnalysisSuccessResponse {
  songData: SongData;
  modelId: string;
  processingTimeMs: number;
}

const SUPPORTED_LANGUAGES = new Set<string>(Object.values(Language));

const parseRequestBody = (body: unknown): SongAnalysisRequestBody => {
  if (!body) {
    throw new Error('Missing request body');
  }

  if (typeof body === 'string') {
    return parseRequestBody(JSON.parse(body));
  }

  if (typeof body !== 'object') {
    throw new Error('Invalid request body format; expected JSON object');
  }

  const record = body as Record<string, unknown>;

  const audioBase64 = typeof record.audioBase64 === 'string' ? record.audioBase64 : undefined;
  const targetLanguage = typeof record.targetLanguage === 'string' ? record.targetLanguage : undefined;
  const enableKaraokeMode = typeof record.enableKaraokeMode === 'boolean' ? record.enableKaraokeMode : undefined;

  if (!audioBase64) {
    throw new Error('audioBase64 is required');
  }
  if (!targetLanguage) {
    throw new Error('targetLanguage is required');
  }
  if (enableKaraokeMode == null) {
    throw new Error('enableKaraokeMode is required');
  }

  return {
    audioBase64,
    fileName: typeof record.fileName === 'string' ? record.fileName : 'uploaded-audio',
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : 'audio/mpeg',
    targetLanguage,
    enableKaraokeMode,
    modelId: typeof record.modelId === 'string' ? record.modelId : undefined,
  };
};

const coerceLanguage = (value: string): Language => {
  if (SUPPORTED_LANGUAGES.has(value)) {
    return value as Language;
  }
  throw new Error(`Unsupported targetLanguage '${value}'. Supported languages: ${Array.from(SUPPORTED_LANGUAGES).join(', ')}`);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  let parsedBody: SongAnalysisRequestBody;
  try {
    parsedBody = parseRequestBody(req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    res.status(400).json({ error: message });
    return;
  }

  const { audioBase64, fileName, mimeType, enableKaraokeMode, modelId: requestedModelId } = parsedBody;
  let targetLanguage: Language;
  try {
    targetLanguage = coerceLanguage(parsedBody.targetLanguage as string);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid target language';
    res.status(400).json({ error: message });
    return;
  }

  let audioData: Buffer;
  try {
    const base64Clean = audioBase64.includes(',') ? audioBase64.split(',').pop() ?? '' : audioBase64;
    audioData = Buffer.from(base64Clean, 'base64');
    if (audioData.byteLength === 0) {
      throw new Error('Decoded audio buffer is empty');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to decode audio data';
    res.status(400).json({ error: `Invalid audioBase64 payload: ${message}` });
    return;
  }

  let geminiClient;
  try {
    geminiClient = getGeminiClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini client initialization failed';
    res.status(500).json({ error: message });
    return;
  }

  const resolvedModelId = resolveModelId(requestedModelId);
  const startedAt = Date.now();

  try {
    const uploadResult = await geminiClient.files.upload({
      file: {
        data: audioData,
        mimeType: mimeType || 'audio/mpeg',
        displayName: fileName || 'uploaded-audio',
      },
    });

    if (!uploadResult.uri || !uploadResult.mimeType) {
      throw new Error('File upload failed; Gemini response missing uri or mimeType');
    }

    const userPrompt = getSongAnalysisUserPromptText(targetLanguage, fileName ?? 'uploaded-audio', enableKaraokeMode);
    const parts: Part[] = [
      { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
      { text: userPrompt },
    ];

    const systemInstruction = getSongAnalysisSystemPrompt(targetLanguage, enableKaraokeMode, fileName ?? 'uploaded-audio');
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        originalLanguage: { type: Type.STRING },
        summary: { type: Type.STRING },
        detailedAnalysis: { type: Type.STRING },
        verses: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              verseNumber: { type: Type.INTEGER },
              original: { type: Type.STRING },
              meaning: { type: Type.STRING },
              startTime: { type: Type.STRING },
              endTime: { type: Type.STRING },
              transliteration: { type: Type.STRING, nullable: true },
              translation: { type: Type.STRING, nullable: true },
              transliterationSegments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    endTime: { type: Type.STRING },
                  },
                  required: ['text', 'startTime', 'endTime'],
                },
                nullable: true,
              },
              translationSegments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    endTime: { type: Type.STRING },
                  },
                  required: ['text', 'startTime', 'endTime'],
                },
                nullable: true,
              },
            },
            required: ['original', 'meaning', 'startTime', 'endTime'],
          },
        },
      },
      required: ['title', 'originalLanguage', 'summary', 'detailedAnalysis', 'verses'],
    } as const;

    const generationResponse: GenerateContentResponse = await geminiClient.models.generateContent({
      model: resolvedModelId,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema,
        systemInstruction,
      },
    });

    const rawText = typeof generationResponse.text === 'string'
      ? generationResponse.text.trim()
      : '';

    if (!rawText) {
      throw new Error('Gemini returned an empty response body');
    }

    const cleanedText = rawText.startsWith('```') ? rawText.replace(/^```json\s*|```$/g, '').trim() : rawText;
    const parsed = JSON.parse(cleanedText) as Partial<RawSongData>;

    if (!parsed.title || !parsed.originalLanguage || !parsed.summary || !parsed.detailedAnalysis || !parsed.verses) {
      throw new Error('Gemini response is missing required song fields');
    }

    const finalVerses: Verse[] = parseSongVerses(parsed.verses as RawVerse[], enableKaraokeMode, targetLanguage);

    const songData: SongData = {
      title: parsed.title,
      originalLanguage: parsed.originalLanguage,
      summary: parsed.summary,
      detailedAnalysis: parsed.detailedAnalysis,
      verses: finalVerses,
    };

    const responsePayload: SongAnalysisSuccessResponse = {
      songData,
      modelId: resolvedModelId,
      processingTimeMs: Date.now() - startedAt,
    };

    res.status(200).json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Song analysis failed';
    console.error('[api/song-analysis] Error', error);
    res.status(502).json({ error: message });
  }
}
