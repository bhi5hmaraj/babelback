import { GenerateContentResponse, Part, Type } from '@google/genai';
import { Buffer } from 'node:buffer';
import { getGeminiClient, resolveModelId } from './_lib/gemini/index.js';
import { getSongAnalysisSystemPrompt, getSongAnalysisUserPromptText, Language } from './_lib/prompts.js';
import { parseSongVerses, RawVerse, Verse } from './_lib/verseParser.js';

interface VercelRequest {
  method?: string;
  body?: unknown;
}

interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
}

interface SongAnalysisRequestBody {
  audioBase64?: string;
  audioUrl?: string;
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

type SongData = {
  title: string;
  originalLanguage: string;
  summary: string;
  detailedAnalysis: string;
  verses: Verse[];
};

type RawSongData = Omit<SongData, 'verses'> & { verses: RawVerse[] };

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
  const audioUrl = typeof record.audioUrl === 'string' ? record.audioUrl : undefined;
  const targetLanguage = typeof record.targetLanguage === 'string' ? record.targetLanguage : undefined;
  const enableKaraokeMode = typeof record.enableKaraokeMode === 'boolean' ? record.enableKaraokeMode : undefined;

  if (!audioBase64 && !audioUrl) {
    throw new Error('Either audioBase64 or audioUrl is required');
  }
  if (!targetLanguage) {
    throw new Error('targetLanguage is required');
  }
  if (enableKaraokeMode == null) {
    throw new Error('enableKaraokeMode is required');
  }

  return {
    audioBase64,
    audioUrl,
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
  const method = (req.method ?? 'GET').toUpperCase();
  try { console.log('[song-analysis] request start', { method }); } catch {}
  if (method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  let parsedBody: SongAnalysisRequestBody;
  try {
    parsedBody = parseRequestBody(req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    try { console.error('[song-analysis] bad body', { error: message }); } catch {}
    res.status(400).json({ error: message });
    return;
  }

  const { audioBase64, audioUrl, fileName, mimeType: providedMimeType, enableKaraokeMode, modelId: requestedModelId } = parsedBody;
  let mimeType: string | undefined = providedMimeType;
  let targetLanguage: Language;
  try {
    targetLanguage = coerceLanguage(parsedBody.targetLanguage as string);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid target language';
    try { console.error('[song-analysis] invalid language', { value: parsedBody.targetLanguage }); } catch {}
    res.status(400).json({ error: message });
    return;
  }

  let audioData: Buffer | null = null;
  if (audioBase64) {
    try {
      const base64Clean = audioBase64.includes(',') ? audioBase64.split(',').pop() ?? '' : audioBase64;
      audioData = Buffer.from(base64Clean, 'base64');
      if (audioData.byteLength === 0) throw new Error('Decoded audio buffer is empty');
      try { console.log('[song-analysis] decoded audio', { bytes: audioData.byteLength, mimeType, fileName, enableKaraokeMode, requestedModelId }); } catch {}
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decode audio data';
      try { console.error('[song-analysis] decode error', { error: message }); } catch {}
      res.status(400).json({ error: `Invalid audioBase64 payload: ${message}` });
      return;
    }
  } else if (audioUrl) {
    // Minimal retry to reduce transient network flakiness
    const attempts = 3;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const resp = await fetch(audioUrl, { cache: 'no-store', redirect: 'follow' as const });
        if (!resp.ok) throw new Error(`fetch(${resp.status})`);
        const arr = await resp.arrayBuffer();
        audioData = Buffer.from(arr);
        if (audioData.byteLength === 0) throw new Error('fetched zero bytes');
        // if mimeType not provided, rely on header
        if (!mimeType) mimeType = resp.headers.get('content-type') || 'audio/mpeg';
        try { console.log('[song-analysis] fetched audio url', { attempt: i + 1, bytes: audioData.byteLength, mimeType, fileName, audioUrl }); } catch {}
        break; // success
      } catch (err: any) {
        lastErr = err;
        const code = (err?.cause && (err.cause.code || err.cause?.code)) || err?.code || 'unknown';
        try { console.error('[song-analysis] fetch url attempt failed', { attempt: i + 1, code, message: err?.message || String(err) }); } catch {}
        await new Promise(r => setTimeout(r, 300 * (i + 1)));
      }
    }
    if (!audioData) {
      const message = (lastErr instanceof Error ? lastErr.message : 'Failed to fetch audio url');
      try { console.error('[song-analysis] fetch url error', { error: message, audioUrl }); } catch {}
      res.status(400).json({ error: `Invalid audioUrl payload: ${message}` });
      return;
    }
  }

  let geminiClient;
  try {
    geminiClient = getGeminiClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini client initialization failed';
    try { console.error('[song-analysis] client init error', { error: message }); } catch {}
    res.status(500).json({ error: message });
    return;
  }

  const resolvedModelId = resolveModelId(requestedModelId);
  const startedAt = Date.now();

  if (!audioData) {
    res.status(400).json({ error: 'No audio data to analyze' });
    return;
  }

  try {
    const audioBlob = new Blob([audioData], { type: mimeType || 'audio/mpeg' });

    try { console.log('[song-analysis] uploading to gemini'); } catch {}
    const uploadResult = await geminiClient.files.upload({
      file: audioBlob,
      config: {
        mimeType: audioBlob.type || 'audio/mpeg',
        displayName: fileName || 'uploaded-audio',
      },
    });

    if (!uploadResult.uri || !uploadResult.mimeType) {
      throw new Error('File upload failed; Gemini response missing uri or mimeType');
    }
    try { console.log('[song-analysis] upload ok', { uri: uploadResult.uri, mimeType: uploadResult.mimeType }); } catch {}

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

    try { console.log('[song-analysis] generating', { model: resolvedModelId }); } catch {}
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
    try { console.log('[song-analysis] parsed', { verses: finalVerses.length, title: parsed.title }); } catch {}

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
    try { console.error('[song-analysis] error', message); } catch {}
    res.status(502).json({ error: message });
  }
}
