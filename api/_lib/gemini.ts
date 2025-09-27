import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: '.env.local' });

const FALLBACK_MODEL_ID = 'gemini-2.5-flash-preview-04-17';

let cachedClient: GoogleGenAI | null = null;

export const getGeminiClient = (): GoogleGenAI => {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY or API_KEY.');
  }

  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
};

export const resolveModelId = (preferred?: string): string => {
  if (preferred && preferred.trim().length > 0) {
    return preferred.trim();
  }

  if (process.env.GEMINI_MODEL_ID && process.env.GEMINI_MODEL_ID.trim().length > 0) {
    return process.env.GEMINI_MODEL_ID.trim();
  }

  if (process.env.GEMINI_DEFAULT_MODEL_ID && process.env.GEMINI_DEFAULT_MODEL_ID.trim().length > 0) {
    return process.env.GEMINI_DEFAULT_MODEL_ID.trim();
  }

  return FALLBACK_MODEL_ID;
};

export const getFallbackModelId = (): string => FALLBACK_MODEL_ID;
