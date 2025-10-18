import { getGeminiClient, resolveModelId } from './_lib/gemini/index.js';
import { getRedis } from './_lib/redis.js'

import { NextApiRequest, NextApiResponse } from 'next';

const getQueryParam = (q: Record<string, string | string[]>, key: string): string | undefined => {
  const v = q[key];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed. Use GET.' });
    return;
  }

  const doGeminiCheck = (getQueryParam(req.query, 'check') ?? '').toLowerCase() === 'gemini';
  const preferredModel = getQueryParam(req.query, 'modelId');

  const node = typeof process !== 'undefined' ? process.version : 'unknown';
  const runtime = 'node';
  const modelId = resolveModelId(preferredModel);

  let hasApiKey = false;
  try {
    hasApiKey = Boolean(process.env.GEMINI_API_KEY || process.env.API_KEY);
  } catch {}

  let gemini: ReturnType<typeof getGeminiClient> | null = null;
  let geminiInitError: string | null = null;
  try {
    gemini = getGeminiClient();
  } catch (err) {
    geminiInitError = err instanceof Error ? err.message : String(err);
  }

  const payload: any = {
    ok: true,
    time: new Date().toISOString(),
    runtime,
    node,
    modelId,
    hasApiKey,
    geminiClientInitialized: Boolean(gemini) && !geminiInitError,
    geminiInitError: geminiInitError ?? undefined,
  };

  // Job store backend detection
  try {
    const hasRestKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
    let backend: 'redis' | 'rest' | 'memory' = 'memory'
    const r = await getRedis()
    if (r) backend = 'redis'
    else if (hasRestKv) backend = 'rest'
    payload.jobStore = { backend }
  } catch {
    payload.jobStore = { backend: 'memory' }
  }

  if (doGeminiCheck && gemini) {
    const started = Date.now();
    try {
      const resp = await gemini.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        config: { responseMimeType: 'text/plain' },
      });
      const ms = Date.now() - started;
      const text = typeof resp.text === 'string' ? resp.text : '';
      payload.geminiPing = { ok: true, ms, sample: text.slice(0, 40) };
    } catch (err) {
      const ms = Date.now() - started;
      payload.geminiPing = { ok: false, ms, error: err instanceof Error ? err.message : String(err) };
    }
  }

  res.status(200).json(payload);
}
