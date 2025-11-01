import '../_lib/loadEnv'
import { NextRequest, NextResponse } from 'next/server'
import { Buffer } from 'node:buffer'
import { GenerateContentResponse, Part, Type } from '@google/genai'
import { getGeminiClient, resolveModelId } from '../_lib/gemini'
import { gaEvent } from '../_lib/ga'
import { getSongAnalysisSystemPrompt, getSongAnalysisUserPromptText, Language } from '../_lib/prompts'
import { parseSongVerses, RawVerse, Verse } from '../_lib/verseParser'
import { getCachedAnalysis, setCachedAnalysis, type GCSObject, extractYouTubeId } from '../_lib/analysisCache'
import { getJob } from '../_lib/jobStore'

export const runtime = 'nodejs'

interface SongAnalysisRequestBody {
  audioBase64?: string
  audioUrl?: string
  fileName?: string
  mimeType?: string
  jobId?: string
  gcsObject?: GCSObject  // Direct GCS object reference (for caching)
  targetLanguage: Language | string
  enableKaraokeMode: boolean
  modelId?: string
}

interface SongAnalysisSuccessResponse {
  songData: SongData
  modelId: string
  processingTimeMs: number
}

const SUPPORTED_LANGUAGES = new Set<string>(Object.values(Language))

type SongData = {
  title: string
  originalLanguage: string
  summary: string
  detailedAnalysis: string
  verses: Verse[]
}

type RawSongData = Omit<SongData, 'verses'> & { verses: RawVerse[] }

const parseRequestBody = (body: unknown): SongAnalysisRequestBody => {
  if (!body) {
    throw new Error('Missing request body')
  }

  if (typeof body === 'string') {
    return parseRequestBody(JSON.parse(body))
  }

  if (typeof body !== 'object') {
    throw new Error('Invalid request body format; expected JSON object')
  }

  const record = body as Record<string, unknown>

  const audioBase64 = typeof record.audioBase64 === 'string' ? record.audioBase64 : undefined
  const audioUrl = typeof record.audioUrl === 'string' ? record.audioUrl : undefined
  const gcsObject = record.gcsObject && typeof record.gcsObject === 'object'
    ? record.gcsObject as GCSObject
    : undefined
  const targetLanguage = typeof record.targetLanguage === 'string' ? record.targetLanguage : undefined
  const enableKaraokeMode = typeof record.enableKaraokeMode === 'boolean' ? record.enableKaraokeMode : undefined

  if (!audioBase64 && !audioUrl) {
    throw new Error('Either audioBase64 or audioUrl is required')
  }
  if (!targetLanguage) {
    throw new Error('targetLanguage is required')
  }
  if (enableKaraokeMode == null) {
    throw new Error('enableKaraokeMode is required')
  }

  return {
    audioBase64,
    audioUrl,
    gcsObject,
    fileName: typeof record.fileName === 'string' ? record.fileName : 'uploaded-audio',
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : 'audio/mpeg',
    jobId: typeof record.jobId === 'string' ? record.jobId : undefined,
    targetLanguage,
    enableKaraokeMode,
    modelId: typeof record.modelId === 'string' ? record.modelId : undefined,
  }
}

const coerceLanguage = (value: string): Language => {
  if (SUPPORTED_LANGUAGES.has(value)) {
    return value as Language
  }
  throw new Error(`Unsupported targetLanguage '${value}'. Supported languages: ${Array.from(SUPPORTED_LANGUAGES).join(', ')}`)
}

const buildGeminiParts = (audioData: Buffer, mimeType: string, targetLanguage: Language, enableKaraokeMode: boolean): Part[] => {
  return [
    { text: getSongAnalysisSystemPrompt(targetLanguage, enableKaraokeMode) },
    {
      inlineData: {
        mimeType,
        data: audioData.toString('base64'),
      },
    },
    { text: getSongAnalysisUserPromptText(targetLanguage, enableKaraokeMode) },
  ]
}

const parseGeminiResponse = (response: GenerateContentResponse): RawSongData => {
  const candidates = response.candidates || []
  if (candidates.length === 0) {
    throw new Error('Gemini returned no candidates')
  }

  const firstCandidate = candidates[0]
  if (!firstCandidate.content?.parts || firstCandidate.content.parts.length === 0) {
    throw new Error('Gemini response missing content parts')
  }

  const firstPart = firstCandidate.content.parts[0]
  const text = (firstPart as { text?: string }).text || ''
  if (!text) {
    throw new Error('Gemini response empty')
  }

  try {
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('Malformed JSON in AI response')
    }
    const jsonSlice = text.slice(jsonStart, jsonEnd + 1)
    return JSON.parse(jsonSlice) as RawSongData
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    throw new Error(`Failed to parse AI response JSON: ${message}`)
  }
}

const normalizeSongData = (raw: RawSongData): SongData => {
  const verses = parseSongVerses(raw.verses)
  const summary = raw.summary?.trim() || 'Summary unavailable.'
  return {
    title: raw.title || 'Untitled Song',
    originalLanguage: raw.originalLanguage || 'Unknown',
    summary,
    detailedAnalysis: raw.detailedAnalysis || summary,
    verses,
  }
}

const sanitizeVerseSegments = (verses: Verse[]) =>
  verses.map((verse) => ({
    ...verse,
    transliterationSegments: Array.isArray(verse.transliterationSegments)
      ? verse.transliterationSegments.filter(
          (seg) =>
            seg &&
            typeof seg.text === 'string' &&
            Number.isFinite(seg.startTime) &&
            Number.isFinite(seg.endTime) &&
            seg.endTime > seg.startTime,
        )
      : undefined,
    translationSegments: Array.isArray(verse.translationSegments)
      ? verse.translationSegments.filter(
          (seg) =>
            seg &&
            typeof seg.text === 'string' &&
            Number.isFinite(seg.startTime) &&
            Number.isFinite(seg.endTime) &&
            seg.endTime > seg.startTime,
        )
      : undefined,
  }))

const recordAnalysisEvent = async (eventName: string, payload: Record<string, unknown>) => {
  try {
    await gaEvent(eventName, payload)
  } catch {}
}

async function handleSongAnalysis(body: unknown) {
  let parsedBody: SongAnalysisRequestBody
  try {
    parsedBody = parseRequestBody(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { audioBase64, audioUrl, mimeType: providedMimeType, enableKaraokeMode, modelId: requestedModelId, jobId } = parsedBody

  let targetLanguage: Language
  try {
    targetLanguage = coerceLanguage(parsedBody.targetLanguage as string)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid target language'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // Resolve modelId early for cache key
  const modelId = await resolveModelId(requestedModelId)

  // Resolve GCS object from either direct param or jobId lookup
  let gcsObject: GCSObject | undefined = parsedBody.gcsObject
  if (!gcsObject && jobId) {
    try {
      const job = await getJob(jobId)
      if (job?.gcsObject) {
        gcsObject = job.gcsObject
      }
    } catch (error) {
      try {
        console.warn('[song-analysis] failed to resolve gcsObject from jobId', {
          jobId,
          error: error instanceof Error ? error.message : String(error)
        })
      } catch {}
    }
  }

  // Check cache if we have GCS object
  if (gcsObject) {
    try {
      const cached = await getCachedAnalysis({
        gcsObject,
        targetLanguage,
        modelId,
        karaokeMode: enableKaraokeMode
      })

      if (cached) {
        try {
          console.log('[song-analysis] returning cached analysis', {
            jobId,
            objectKey: cached.objectKey,
            verses: cached.songData.verses?.length || 0,
            isSeed: cached.isSeed || false
          })
        } catch {}

        await recordAnalysisEvent('analysis_cache_hit', {
          source: audioUrl ? 'url' : 'file',
          job_id: jobId,
          model_id: modelId,
          is_seed: cached.isSeed || false
        })

        return NextResponse.json({
          songData: cached.songData,
          modelId: cached.modelId,
          processingTimeMs: 0, // cached response
          cached: true,
          cachedAt: cached.cachedAt
        })
      }
    } catch (error) {
      try {
        console.error('[song-analysis] cache check error', {
          error: error instanceof Error ? error.message : String(error)
        })
      } catch {}
      // Continue with analysis if cache check fails
    }
  }

  let mimeType = providedMimeType
  let audioData: Buffer | null = null

  if (audioBase64) {
    try {
      const base64Clean = audioBase64.includes(',') ? audioBase64.split(',').pop() ?? '' : audioBase64
      audioData = Buffer.from(base64Clean, 'base64')
      if (audioData.byteLength === 0) throw new Error('Decoded audio buffer is empty')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decode audio data'
      return NextResponse.json({ error: `Invalid audioBase64 payload: ${message}` }, { status: 400 })
    }
  } else if (audioUrl) {
    const attempts = 3
    let lastErr: unknown
    let lastErrCode: string | undefined
    for (let i = 0; i < attempts; i++) {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 20_000)
      try {
        const resp = await fetch(audioUrl, { cache: 'no-store', redirect: 'follow', signal: ac.signal })
        clearTimeout(t)
        if (!resp.ok) throw new Error(`fetch(${resp.status})`)
        const arr = await resp.arrayBuffer()
        audioData = Buffer.from(arr)
        if (audioData.byteLength === 0) throw new Error('fetched zero bytes')
        if (!mimeType) mimeType = resp.headers.get('content-type') || 'audio/mpeg'
        break
      } catch (err: any) {
        clearTimeout(t)
        lastErr = err
        const code = err?.cause?.code || err?.code || (err?.name === 'AbortError' ? 'ETIMEDOUT' : 'unknown')
        lastErrCode = typeof code === 'string' ? code : undefined
        await recordAnalysisEvent('analysis_fetch_retry', {
          job_id: parsedBody.jobId,
          source: 'url',
          error_type: 'fetch_audio_url',
          attempt: i + 1,
          code: typeof code === 'string' ? code : String(code ?? 'unknown'),
        })
        await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)))
      }
    }
    if (!audioData) {
      const message = lastErr instanceof Error ? lastErr.message : 'Failed to fetch audio url'
      await recordAnalysisEvent('analysis_error', {
        source: 'url',
        error_type: 'fetch_audio_url',
        job_id: parsedBody.jobId,
        code: lastErrCode || 'unknown',
        message: String(message).slice(0, 120),
      })
      return NextResponse.json({ error: `Invalid audioUrl payload: ${message}` }, { status: 400 })
    }
  }

  if (!audioData) {
    return NextResponse.json({ error: 'Missing audio data' }, { status: 400 })
  }

  const generationStart = Date.now()
  let response: GenerateContentResponse
  try {
    const client = await getGeminiClient()
    const parts = buildGeminiParts(audioData, mimeType || 'audio/mpeg', targetLanguage, enableKaraokeMode)
    response = await client.models.generateContent({
      model: modelId,
      contents: [{ role: 'user', parts }],
      responseModalities: [Type.OUTPUT_TEXT],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Gemini error'
    await recordAnalysisEvent('analysis_error', {
      source: audioUrl ? 'url' : 'file',
      job_id: parsedBody.jobId,
      error_type: 'gemini_request',
      message: String(message).slice(0, 120),
    })
    return NextResponse.json({ error: `Gemini request failed: ${message}` }, { status: 502 })
  }

  let rawSongData: RawSongData
  try {
    rawSongData = parseGeminiResponse(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse Gemini response'
    await recordAnalysisEvent('analysis_error', {
      source: audioUrl ? 'url' : 'file',
      job_id: parsedBody.jobId,
      error_type: 'gemini_parse',
      message: String(message).slice(0, 120),
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }

  let normalized: SongData
  try {
    normalized = normalizeSongData(rawSongData)
    normalized.verses = sanitizeVerseSegments(normalized.verses)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to normalize song data'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const processingTimeMs = Date.now() - generationStart

  await recordAnalysisEvent('analysis_complete', {
    source: audioUrl ? 'url' : 'file',
    job_id: jobId,
    verses: normalized.verses.length,
    ai_duration_ms: processingTimeMs,
    model_id: modelId,
  })

  // Store in cache if we have GCS object
  if (gcsObject) {
    try {
      const youtubeId = audioUrl ? extractYouTubeId(audioUrl) : undefined

      await setCachedAnalysis({
        gcsObject,
        targetLanguage,
        modelId,
        karaokeMode: enableKaraokeMode,
        sourceType: audioUrl ? 'youtube' : 'upload',
        youtubeUrl: audioUrl,
        youtubeId,
        jobId,
        songData: normalized,
        processingTimeMs,
        ttl: 30 * 24 * 60 * 60, // 30 days
      })

      try {
        console.log('[song-analysis] cached analysis', {
          jobId,
          gcsPath: `${gcsObject.bucket}/${gcsObject.path}`,
          verses: normalized.verses.length
        })
      } catch {}
    } catch (error) {
      try {
        console.error('[song-analysis] failed to cache analysis', {
          error: error instanceof Error ? error.message : String(error)
        })
      } catch {}
      // Don't fail the request if caching fails
    }
  }

  const payload: SongAnalysisSuccessResponse = {
    songData: normalized,
    modelId,
    processingTimeMs,
  }

  return NextResponse.json(payload)
}

export async function POST(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 })
  }

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

  return handleSongAnalysis(body)
}
