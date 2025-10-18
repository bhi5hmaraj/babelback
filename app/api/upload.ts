import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request: req,
      // Keep uploads public for now; you can switch to 'private' later
      onBeforeGenerateToken: async (_pathname, _clientPayload) => {
        return {
          allowedContentTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/x-m4a'],
          tokenPayload: JSON.stringify({ role: 'song-audio' }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        try { console.log('[upload] completed', { url: blob.url, pathname: (blob as any).pathname }); } catch {}
      },
    });
    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try { console.error('[upload] error', message); } catch {}
    res.status(400).json({ error: message });
  }
}
