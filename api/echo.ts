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

type EchoPayload = {
  message: string | null;
  receivedAt: string;
  method: HttpMethod;
  hasBody: boolean;
};

const parseBodyForMessage = (body: unknown): string | null => {
  if (!body) {
    return null;
  }

  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && 'message' in parsed) {
        const candidate = (parsed as Record<string, unknown>).message;
        return typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
      }
      return body;
    } catch (error) {
      return body;
    }
  }

  if (typeof body === 'object') {
    const candidate = (body as Record<string, unknown>).message;
    if (typeof candidate === 'string') {
      return candidate;
    }
    if (candidate != null) {
      return JSON.stringify(candidate);
    }
  }

  return null;
};

const parseQueryForMessage = (query: Record<string, string | string[]>): string | null => {
  const candidate = query.message;
  if (Array.isArray(candidate)) {
    return candidate.length > 0 ? candidate[0] ?? null : null;
  }
  return typeof candidate === 'string' ? candidate : null;
};

export default function handler(req: VercelRequest, res: VercelResponse) {
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

  const messageFromBody = parseBodyForMessage(req.body);
  const messageFromQuery = parseQueryForMessage(req.query);

  const payload: EchoPayload = {
    message: messageFromBody ?? messageFromQuery,
    receivedAt: new Date().toISOString(),
    method,
    hasBody: Boolean(req.body),
  };

  console.log('[api/echo] sending payload', payload);
  res.status(200).json(payload);
}
