/**
 * Client-side helpers that call our server API routes.
 *
 * - fetchSongDataFromGemini: Uploads a local file then triggers analysis.
 * - fetchSongDataFromUrl: Triggers analysis for a remote/signed URL.
 * - fetchSingingFeedback: Scores a recorded attempt against reference verses.
 */
import { SongData, Language, Verse, SingingScore } from '../types';
import { upload } from '@vercel/blob/client';
import { trackEvent } from './analytics';

const SONG_ANALYSIS_ENDPOINT = '/api/song-analysis';
const SINGING_FEEDBACK_ENDPOINT = '/api/singing-feedback';

/** Placeholder: AI client is server-side; kept for legacy compatibility. */
export const initializeAiClient = (_apiKey: string): void => {
  // No-op in the new architecture; Gemini calls are routed through serverless APIs.
};

/** Read a Blob and resolve to a base64 string (no data URL prefix). */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.includes(',') ? reader.result.split(',')[1] : reader.result;
        resolve(base64);
      } else {
        reject(new Error('[geminiService] Failed to read blob as base64 string.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('[geminiService] Unknown FileReader error.'));
    reader.readAsDataURL(blob);
  });
};

/** Small helper that parses JSON (or text) and throws with server error message when present. */
const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMessage = typeof payload === 'object' && payload && 'error' in payload
      ? (payload as { error: string }).error
      : typeof payload === 'string'
        ? payload
        : `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload as T;
};

/** Upload a local audio file and request server-side analysis. */
export const fetchSongDataFromGemini = async (
  audioFile: File,
  targetLanguage: Language,
  enableKaraokeMode: boolean,
  modelId: string,
  onProgress?: (message: string) => void
): Promise<SongData> => {
  if (!modelId) {
    throw new Error('AI Model ID is required for processing.');
  }

  let response: Response | null = null;
  try {
    // Preferred path: stream upload to GCS via our proxy (no vendor limits)
    if (onProgress) onProgress('Uploading audio…');
    const upStart = Date.now();
    trackEvent('upload_start', {
      source: 'file',
      content_type: audioFile.type || 'application/octet-stream',
      size_bytes: audioFile.size,
      ext: (audioFile.name.split('.').pop() || '').toLowerCase(),
    });
    const up = await fetch('/api/uploads/audio', {
      method: 'POST',
      headers: {
        'Content-Type': audioFile.type || 'application/octet-stream',
        'x-file-name': encodeURIComponent(audioFile.name || 'upload'),
      },
      body: audioFile,
    })
    if (!up.ok) throw new Error(`upload failed (${up.status})`)
    const upJson = await up.json().catch(() => ({} as any))
    const url = upJson?.url
    const analysisJobId = upJson?.id as (string | undefined)
    if (!url) throw new Error('upload returned no url')
    trackEvent('upload_done', { source: 'file', size_bytes: audioFile.size, upload_duration_ms: Date.now() - upStart, ok: 1 })
    // Emit analysis_start with a job_id so all downstream events can be joined
    if (analysisJobId) {
      trackEvent('analysis_start', {
        source: 'file',
        job_id: analysisJobId,
        model_id: modelId,
        lang: targetLanguage,
        karaoke: enableKaraokeMode ? 1 : 0,
      })
    }
    if (onProgress) onProgress('Requesting song analysis…');
    response = await fetch(SONG_ANALYSIS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioUrl: url,
        fileName: audioFile.name,
        mimeType: audioFile.type,
        jobId: analysisJobId,
        targetLanguage,
        enableKaraokeMode,
        modelId,
      }),
    });
  } catch (e) {
    // Fallback if Vercel Blob is not configured: send base64 directly
    const message = e instanceof Error ? e.message : String(e);
    const missingToken = /No token found|BLOB_READ_WRITE_TOKEN/i.test(message) || /upload failed/i.test(message);
    if (!missingToken) throw e;
    // Guard: avoid posting large base64 payloads to /api/song-analysis (Vercel body limit)
    const MAX_BASE64_BYTES = 2 * 1024 * 1024; // ~2MB safe fallback
    if (audioFile.size > MAX_BASE64_BYTES) {
      trackEvent('upload_error', { source: 'file', error_type: 'upload', reason: 'fallback_blocked_large', size_bytes: audioFile.size });
      throw new Error('Upload failed and the file is too large for fallback. Please retry upload on a stable connection.');
    }
    if (onProgress) onProgress('Uploading (fallback)…');
    const fbStart = Date.now();
    const base64 = await blobToBase64(audioFile);
    trackEvent('upload_done', { source: 'file', size_bytes: audioFile.size, upload_duration_ms: Date.now() - fbStart, ok: 1, method: 'base64' })
    if (onProgress) onProgress('Requesting song analysis…');
    response = await fetch(SONG_ANALYSIS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: base64,
        fileName: audioFile.name,
        mimeType: audioFile.type || 'application/octet-stream',
        targetLanguage,
        enableKaraokeMode,
        modelId,
      }),
    });
  }

  const { songData } = await parseJsonResponse<{ songData: SongData }>(response);

  if (!songData || !songData.verses) {
    throw new Error('Server returned invalid song data.');
  }

  if (onProgress) onProgress('Song analysis received. Preparing display...');
  return songData;
};

/** Request analysis for a remote audio URL (e.g., GCS signed URL). */
export const fetchSongDataFromUrl = async (
  audioUrl: string,
  targetLanguage: Language,
  enableKaraokeMode: boolean,
  modelId: string,
  opts?: { fileName?: string; mimeType?: string; jobId?: string },
  onProgress?: (message: string) => void
): Promise<SongData> => {
  if (!modelId) throw new Error('AI Model ID is required for processing.');
  if (!audioUrl) throw new Error('audioUrl is required');
  if (onProgress) onProgress('Requesting song analysis…');
  const payload = {
    audioUrl,
    fileName: opts?.fileName || 'downloaded-audio',
    mimeType: opts?.mimeType || 'audio/mpeg',
    jobId: opts?.jobId,
    targetLanguage,
    enableKaraokeMode,
    modelId,
  };
  let response = await fetch(SONG_ANALYSIS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    // Try client-side proxy → base64 fallback if server failed to fetch the URL
    const text = await response.text().catch(() => '');
    const isUrlFetchError = /Invalid audioUrl payload|fetch\(/i.test(text) || response.status === 400;
    if (isUrlFetchError) {
      if (onProgress) onProgress('Fetching audio via proxy…');
      const proxied = await fetch(`/api/proxy?url=${encodeURIComponent(audioUrl)}`);
      if (!proxied.ok) {
        throw new Error(text || `Song analysis failed (${response.status})`);
      }
      const buf = await proxied.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      if (onProgress) onProgress('Retrying song analysis…');
      response = await fetch(SONG_ANALYSIS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          targetLanguage,
          enableKaraokeMode,
          modelId,
        }),
      });
    }
  }
  const { songData } = await parseJsonResponse<{ songData: SongData }>(response);
  if (!songData || !songData.verses) throw new Error('Server returned invalid song data.');
  if (onProgress) onProgress('Song analysis received. Preparing display...');
  return songData;
};

/** Submit a recorded attempt and get SingingScore back from the server. */
export const fetchSingingFeedback = async (
  audioBlob: Blob,
  referenceVerses: Verse[],
  targetLanguage: Language,
  modelId: string
): Promise<SingingScore> => {
  if (!modelId) {
    throw new Error('AI Model ID is required for singing feedback.');
  }
  if (!referenceVerses || referenceVerses.length === 0) {
    throw new Error('No reference verses provided for singing feedback.');
  }

  const audioBase64 = await blobToBase64(audioBlob);
  const payload = {
    audioBase64,
    mimeType: audioBlob.type,
    referenceVerses,
    targetLanguage,
    modelId,
  };

  const response = await fetch(SINGING_FEEDBACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const { singingScore } = await parseJsonResponse<{ singingScore: SingingScore }>(response);

  if (!singingScore || !Array.isArray(singingScore.verseScores)) {
    throw new Error('Server returned invalid singing feedback data.');
  }

  return singingScore;
};
