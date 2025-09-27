import { GenerateContentResponse, Part, Type } from '@google/genai';
import { getGeminiClient, resolveModelId } from './_lib/gemini';

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[]>;
  body?: unknown;
}

interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | string;

type PromptPayload = {
  message: string | null;
  modelId?: string;
};

type GeminiPayload = {
  message: string;
  receivedAt: string;
  method: HttpMethod;
  hasBody: boolean;
  modelId: string;
  geminiText: string;
};

const parseBodyForPrompt = (body: unknown): PromptPayload => {
  if (!body) {
    return { message: null };
  }

  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parseBodyForPrompt(parsed);
    } catch (error) {
      return { message: body };
    }
  }

  if (typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const candidate = record.message ?? record.prompt;
    const rawModel = record.modelId;
    return {
      message: typeof candidate === 'string'
        ? candidate
        : candidate != null
          ? JSON.stringify(candidate)
          : null,
      modelId: typeof rawModel === 'string' && rawModel.trim().length > 0 ? rawModel.trim() : undefined,
    };
  }

  return { message: null };
};

const parseQueryForPrompt = (query: Record<string, string | string[]>): PromptPayload => {
  const toStringOrUndefined = (value: string | string[] | undefined): string | undefined => {
    if (Array.isArray(value)) {
      const first = value.length > 0 ? value[0] ?? undefined : undefined;
      return first && first.trim().length > 0 ? first.trim() : undefined;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0 ? value.trim() : undefined;
    }
    return undefined;
  };

  return {
    message: toStringOrUndefined(query.message ?? query.prompt) ?? null,
    modelId: toStringOrUndefined(query.modelId),
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method ?? 'GET') as HttpMethod;

  console.log('[api/echo] incoming request', {
    method,
    query: req.query,
    hasBody: Boolean(req.body),
    bodyType: req.body ? typeof req.body : 'undefined',
  });

  if (method === 'OPTIONS') {
    res.status(200).json({ ok: true });
    console.log('[api/echo] responded to OPTIONS');
    return;
  }

  const bodyPrompt = parseBodyForPrompt(req.body);
  const queryPrompt = parseQueryForPrompt(req.query);
  const message = bodyPrompt.message ?? queryPrompt.message;
  const modelId = resolveModelId(bodyPrompt.modelId ?? queryPrompt.modelId);

  if (!message) {
    console.warn('[api/echo] missing prompt message');
    res.status(400).json({ error: 'Request must include a message prompt via message, prompt, or query parameter.' });
    return;
  }

  let geminiClient;
  try {
    geminiClient = getGeminiClient();
  } catch (error) {
    console.error('[api/echo] Gemini API key is not configured', error);
    res.status(500).json({ error: 'Gemini API key is not configured on the server.' });
    return;
  }

  let geminiText = '';

  try {
    const promptParts: Part[] = [{ text: message }];
    const startedAt = Date.now();
    const response: GenerateContentResponse = await geminiClient.models.generateContent({
      model: modelId,
      contents: [{ role: 'user', parts: promptParts }],
      config: {
        responseSchema: { type: Type.STRING },
        responseMimeType: 'text/plain',
      },
    });
    const textOutput = typeof response.text === 'string' ? response.text : '';
    geminiText = textOutput;
    const durationMs = Date.now() - startedAt;

    console.log('[api/echo] Gemini call succeeded', {
      modelId,
      durationMs,
      textLength: geminiText.length,
    });
  } catch (error) {
    console.error('[api/echo] Gemini call failed', error);
    res.status(502).json({ error: 'Gemini generation failed.', details: error instanceof Error ? error.message : String(error) });
    return;
  }

  const payload: GeminiPayload = {
    message,
    receivedAt: new Date().toISOString(),
    method,
    hasBody: Boolean(req.body),
    modelId,
    geminiText,
  };

  console.log('[api/echo] sending payload', payload);
  res.status(200).json(payload);
}
