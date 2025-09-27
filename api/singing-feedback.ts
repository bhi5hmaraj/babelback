import { GenerateContentResponse, Part, Type } from '@google/genai';
import { getGeminiClient, resolveModelId } from './_lib/gemini';
import { getSingingFeedbackPrompt } from '../services/prompts';
import { Language, SingingScore, Verse } from '../types';

interface VercelRequest {
  method?: string;
  body?: unknown;
}

interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
}

interface SingingFeedbackRequestBody {
  audioBase64: string;
  mimeType?: string;
  modelId?: string;
  targetLanguage: Language | string;
  referenceVerses: Verse[];
}

interface SingingFeedbackSuccessResponse {
  singingScore: SingingScore;
  modelId: string;
  processingTimeMs: number;
}

const SUPPORTED_LANGUAGES = new Set<string>(Object.values(Language));

const feedbackObjectSchema = {
  type: Type.OBJECT,
  properties: {
    positive: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvementAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['positive', 'improvementAreas'],
} as const;

const verseScoreSchema = {
  type: Type.OBJECT,
  properties: {
    verseNumber: { type: Type.INTEGER },
    pronunciationAccuracyScore: { type: Type.NUMBER },
    timingAlignmentScore: { type: Type.NUMBER },
    vocalClarityScore: { type: Type.NUMBER },
    feedback: feedbackObjectSchema,
    userAttemptTranscription: { type: Type.STRING, nullable: true },
  },
  required: [
    'verseNumber',
    'pronunciationAccuracyScore',
    'timingAlignmentScore',
    'vocalClarityScore',
    'feedback',
  ],
} as const;

const singingFeedbackResponseSchema = {
  type: Type.OBJECT,
  properties: {
    overallScore: { type: Type.NUMBER },
    pronunciationAccuracyScore: { type: Type.NUMBER },
    timingAlignmentScore: { type: Type.NUMBER },
    vocalClarityScore: { type: Type.NUMBER },
    feedback: feedbackObjectSchema,
    userAttemptTranscription: { type: Type.STRING, nullable: true },
    verseScores: { type: Type.ARRAY, items: verseScoreSchema },
  },
  required: [
    'overallScore',
    'pronunciationAccuracyScore',
    'timingAlignmentScore',
    'vocalClarityScore',
    'feedback',
    'verseScores',
  ],
} as const;

const parseRequestBody = (body: unknown): SingingFeedbackRequestBody => {
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
  const referenceVerses = Array.isArray(record.referenceVerses) ? (record.referenceVerses as Verse[]) : undefined;

  if (!audioBase64) {
    throw new Error('audioBase64 is required');
  }
  if (!targetLanguage) {
    throw new Error('targetLanguage is required');
  }
  if (!referenceVerses || referenceVerses.length === 0) {
    throw new Error('referenceVerses must be a non-empty array');
  }

  return {
    audioBase64,
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : 'audio/webm',
    modelId: typeof record.modelId === 'string' ? record.modelId : undefined,
    targetLanguage,
    referenceVerses,
  };
};

const coerceLanguage = (value: string): Language => {
  if (SUPPORTED_LANGUAGES.has(value)) {
    return value as Language;
  }
  throw new Error(`Unsupported targetLanguage '${value}'. Supported languages: ${Array.from(SUPPORTED_LANGUAGES).join(', ')}`);
};

const formatSecondsToMMSSsss = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds - minutes * 60 - seconds) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  let parsedBody: SingingFeedbackRequestBody;
  try {
    parsedBody = parseRequestBody(req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    res.status(400).json({ error: message });
    return;
  }

  let targetLanguage: Language;
  try {
    targetLanguage = coerceLanguage(parsedBody.targetLanguage as string);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid target language';
    res.status(400).json({ error: message });
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

  const resolvedModelId = resolveModelId(parsedBody.modelId);
  const audioBase64Clean = parsedBody.audioBase64.includes(',')
    ? parsedBody.audioBase64.split(',').pop() ?? ''
    : parsedBody.audioBase64;

  const referenceVerses = parsedBody.referenceVerses;
  const baseStartTime = referenceVerses[0]?.startTime ?? 0;

  const referenceVersesInfo = referenceVerses.map((verse) => ({
    originalVerseNumber: verse.verseNumber,
    transliteratedText:
      verse.transliterationSegments && verse.transliterationSegments.length > 0
        ? verse.transliterationSegments.map((segment) => segment.text).join(' ')
        : verse.transliteration || '(Transliteration not available for this verse)',
  }));

  const referenceSegmentTimings = referenceVerses.flatMap((verse) => {
    if (verse.transliterationSegments && verse.transliterationSegments.length > 0) {
      return verse.transliterationSegments.map((segment) => ({
        text: segment.text,
        startTime: formatSecondsToMMSSsss(Math.max(0, segment.startTime - baseStartTime)),
        endTime: formatSecondsToMMSSsss(Math.max(0, segment.endTime - baseStartTime)),
      }));
    }

    if (verse.transliteration) {
      return [
        {
          text: `(Full transliteration V${verse.verseNumber}) ${verse.transliteration.substring(0, 30)}...`,
          startTime: formatSecondsToMMSSsss(Math.max(0, verse.startTime - baseStartTime)),
          endTime: formatSecondsToMMSSsss(Math.max(0, verse.endTime - baseStartTime)),
        },
      ];
    }

    return [];
  });

  const referenceSegmentTimingsJson = JSON.stringify(referenceSegmentTimings, null, 2);
  const promptText = getSingingFeedbackPrompt(targetLanguage, referenceVersesInfo, referenceSegmentTimingsJson);

  const parts: Part[] = [
    { inlineData: { mimeType: parsedBody.mimeType || 'audio/webm', data: audioBase64Clean } },
    { text: promptText },
  ];

  const startedAt = Date.now();

  try {
    const generationResponse: GenerateContentResponse = await geminiClient.models.generateContent({
      model: resolvedModelId,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: singingFeedbackResponseSchema,
      },
    });

    const rawText = typeof generationResponse.text === 'string' ? generationResponse.text.trim() : '';
    if (!rawText) {
      throw new Error('Gemini returned an empty response body');
    }

    const cleanedText = rawText.startsWith('```') ? rawText.replace(/^```json\s*|```$/g, '').trim() : rawText;
    const parsedScore = JSON.parse(cleanedText) as SingingScore;

    if (
      typeof parsedScore.overallScore !== 'number' ||
      typeof parsedScore.pronunciationAccuracyScore !== 'number' ||
      !parsedScore.feedback ||
      !Array.isArray(parsedScore.feedback.positive) ||
      !Array.isArray(parsedScore.verseScores)
    ) {
      throw new Error('Gemini response is missing required singing score fields');
    }

    const responsePayload: SingingFeedbackSuccessResponse = {
      singingScore: parsedScore,
      modelId: resolvedModelId,
      processingTimeMs: Date.now() - startedAt,
    };

    res.status(200).json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Singing feedback generation failed';
    console.error('[api/singing-feedback] Error', error);
    res.status(502).json({ error: message });
  }
}
