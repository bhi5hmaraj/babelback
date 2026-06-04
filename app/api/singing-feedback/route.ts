import '../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { GenerateContentResponse, Part, Type } from '@google/genai'
import { getGeminiClient, resolveModelId } from '../_lib/gemini'
import { getSingingFeedbackPrompt, Language, ReferenceVerseForPrompt } from '../_lib/prompts'
import { enforceRateLimit } from '../_lib/rateLimit'

export const runtime = 'nodejs'

// Cap inline audio to protect serverless memory / Gemini cost.
const MAX_AUDIO_BYTES = Number(process.env.MAX_AUDIO_BYTES || 25 * 1024 * 1024)

type APISegment = { text: string; startTime: number; endTime: number }
type APIVerse = {
  verseNumber: number
  transliteration?: string
  transliterationSegments?: APISegment[]
  startTime: number
  endTime: number
}

interface SingingFeedbackRequestBody {
  audioBase64: string
  mimeType?: string
  modelId?: string
  targetLanguage: Language | string
  referenceVerses: APIVerse[]
}

interface SingingScore {
  overallScore: number
  pronunciationAccuracyScore: number
  timingAlignmentScore: number
  vocalClarityScore: number
  feedback: { positive: string[]; improvementAreas: string[] }
  userAttemptTranscription?: string
  verseScores: Array<{
    verseNumber: number
    pronunciationAccuracyScore: number
    timingAlignmentScore: number
    vocalClarityScore: number
    feedback: { positive: string[]; improvementAreas: string[] }
    userAttemptTranscription?: string
  }>
}

interface SingingFeedbackSuccessResponse {
  singingScore: SingingScore
  modelId: string
  processingTimeMs: number
}

const SUPPORTED_LANGUAGES = new Set<string>(Object.values(Language))

const feedbackObjectSchema = {
  type: Type.OBJECT,
  properties: {
    positive: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvementAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['positive', 'improvementAreas'],
} as const

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
} as const

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
} as const

const parseRequestBody = (body: unknown): SingingFeedbackRequestBody => {
  if (!body) throw new Error('Missing request body')
  if (typeof body === 'string') return parseRequestBody(JSON.parse(body))
  if (typeof body !== 'object') throw new Error('Invalid request body format; expected JSON object')

  const record = body as Record<string, unknown>
  const audioBase64 = typeof record.audioBase64 === 'string' ? record.audioBase64 : undefined
  const targetLanguage = typeof record.targetLanguage === 'string' ? record.targetLanguage : undefined
  const referenceVerses = Array.isArray(record.referenceVerses) ? (record.referenceVerses as APIVerse[]) : undefined

  if (!audioBase64) throw new Error('audioBase64 is required')
  if (!targetLanguage) throw new Error('targetLanguage is required')
  if (!referenceVerses || referenceVerses.length === 0) throw new Error('referenceVerses must be a non-empty array')

  return {
    audioBase64,
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : 'audio/webm',
    modelId: typeof record.modelId === 'string' ? record.modelId : undefined,
    targetLanguage,
    referenceVerses,
  }
}

const coerceLanguage = (value: string): Language => {
  if (SUPPORTED_LANGUAGES.has(value)) return value as Language
  throw new Error(`Unsupported targetLanguage '${value}'. Supported languages: ${Array.from(SUPPORTED_LANGUAGES).join(', ')}`)
}

const formatSecondsToMMSSsss = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const milliseconds = Math.floor((totalSeconds - minutes * 60 - seconds) * 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'singing-feedback', 20, 60)
  if (limited) return limited

  let body: unknown = null
  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      body = await req.json()
    } else {
      const text = await req.text()
      body = text ? JSON.parse(text) : {}
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON payload'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  let parsedBody: SingingFeedbackRequestBody
  try {
    parsedBody = parseRequestBody(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  let targetLanguage: Language
  try {
    targetLanguage = coerceLanguage(parsedBody.targetLanguage as string)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid target language'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const audioBase64Clean = parsedBody.audioBase64.includes(',')
    ? parsedBody.audioBase64.split(',').pop() ?? ''
    : parsedBody.audioBase64

  // base64 expands ~4/3; estimate decoded size cheaply before allocating.
  const approxBytes = Math.floor((audioBase64Clean.length * 3) / 4)
  if (approxBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio too large (max ${Math.floor(MAX_AUDIO_BYTES / (1024 * 1024))}MB).` },
      { status: 413 },
    )
  }

  let geminiClient
  try {
    geminiClient = getGeminiClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini client initialization failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const resolvedModelId = resolveModelId(parsedBody.modelId)
  const referenceVerses = parsedBody.referenceVerses
  const baseStartTime = referenceVerses[0]?.startTime ?? 0

  const referenceVersesInfo: ReferenceVerseForPrompt[] = referenceVerses.map((verse) => ({
    originalVerseNumber: verse.verseNumber,
    transliteratedText:
      verse.transliterationSegments && verse.transliterationSegments.length > 0
        ? verse.transliterationSegments.map((segment) => segment.text).join(' ')
        : verse.transliteration || '(Transliteration not available for this verse)',
  }))

  const referenceSegmentTimings = referenceVerses.flatMap((verse) => {
    if (verse.transliterationSegments && verse.transliterationSegments.length > 0) {
      return verse.transliterationSegments.map((segment) => ({
        text: segment.text,
        startTime: formatSecondsToMMSSsss(Math.max(0, segment.startTime - baseStartTime)),
        endTime: formatSecondsToMMSSsss(Math.max(0, segment.endTime - baseStartTime)),
      }))
    }
    if (verse.transliteration) {
      return [
        {
          text: `(Full transliteration V${verse.verseNumber}) ${verse.transliteration.substring(0, 30)}...`,
          startTime: formatSecondsToMMSSsss(Math.max(0, verse.startTime - baseStartTime)),
          endTime: formatSecondsToMMSSsss(Math.max(0, verse.endTime - baseStartTime)),
        },
      ]
    }
    return []
  })

  const referenceSegmentTimingsJson = JSON.stringify(referenceSegmentTimings, null, 2)
  const promptText = getSingingFeedbackPrompt(targetLanguage, referenceVersesInfo, referenceSegmentTimingsJson)

  const parts: Part[] = [
    { inlineData: { mimeType: parsedBody.mimeType || 'audio/webm', data: audioBase64Clean } },
    { text: promptText },
  ]

  const startedAt = Date.now()
  try {
    const generationResponse: GenerateContentResponse = await geminiClient.models.generateContent({
      model: resolvedModelId,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: singingFeedbackResponseSchema,
      },
    })

    const rawText = typeof generationResponse.text === 'string' ? generationResponse.text.trim() : ''
    if (!rawText) throw new Error('Gemini returned an empty response body')

    const cleanedText = rawText.startsWith('```') ? rawText.replace(/^```json\s*|```$/g, '').trim() : rawText
    const parsedScore = JSON.parse(cleanedText) as SingingScore

    if (
      typeof parsedScore.overallScore !== 'number' ||
      typeof parsedScore.pronunciationAccuracyScore !== 'number' ||
      !parsedScore.feedback ||
      !Array.isArray(parsedScore.feedback.positive) ||
      !Array.isArray(parsedScore.verseScores)
    ) {
      throw new Error('Gemini response is missing required singing score fields')
    }

    const responsePayload: SingingFeedbackSuccessResponse = {
      singingScore: parsedScore,
      modelId: resolvedModelId,
      processingTimeMs: Date.now() - startedAt,
    }
    return NextResponse.json(responsePayload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Singing feedback generation failed'
    try { console.error('[singing-feedback] error', message) } catch {}
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
