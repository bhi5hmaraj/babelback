import { SongData, Language, Verse, SingingScore } from '../types';
import { upload } from '@vercel/blob/client';

const SONG_ANALYSIS_ENDPOINT = '/api/song-analysis';
const SINGING_FEEDBACK_ENDPOINT = '/api/singing-feedback';

export const initializeAiClient = (_apiKey: string): void => {
  // No-op in the new architecture; Gemini calls are routed through serverless APIs.
};

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

  if (onProgress) onProgress('Uploading audio…');
  const { url } = await upload(audioFile.name, audioFile, {
    access: 'public',
    contentType: audioFile.type || 'application/octet-stream',
    handleUploadUrl: '/api/upload',
    multipart: true,
  });

  if (onProgress) onProgress('Requesting song analysis…');
  const response = await fetch(SONG_ANALYSIS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioUrl: url,
      fileName: audioFile.name,
      mimeType: audioFile.type,
      targetLanguage,
      enableKaraokeMode,
      modelId,
    }),
  });

  const { songData } = await parseJsonResponse<{ songData: SongData }>(response);

  if (!songData || !songData.verses) {
    throw new Error('Server returned invalid song data.');
  }

  if (onProgress) onProgress('Song analysis received. Preparing display...');
  return songData;
};

export const fetchSongDataFromUrl = async (
  audioUrl: string,
  targetLanguage: Language,
  enableKaraokeMode: boolean,
  modelId: string,
  opts?: { fileName?: string; mimeType?: string },
  onProgress?: (message: string) => void
): Promise<SongData> => {
  if (!modelId) throw new Error('AI Model ID is required for processing.');
  if (!audioUrl) throw new Error('audioUrl is required');
  if (onProgress) onProgress('Requesting song analysis…');
  const response = await fetch(SONG_ANALYSIS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioUrl,
      fileName: opts?.fileName || 'downloaded-audio',
      mimeType: opts?.mimeType || 'audio/mpeg',
      targetLanguage,
      enableKaraokeMode,
      modelId,
    }),
  });
  const { songData } = await parseJsonResponse<{ songData: SongData }>(response);
  if (!songData || !songData.verses) throw new Error('Server returned invalid song data.');
  if (onProgress) onProgress('Song analysis received. Preparing display...');
  return songData;
};

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
