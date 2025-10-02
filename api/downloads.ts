import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getJob, newId, putJob } from './_lib/downloadJobs'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // Simple debug: list ids (not for production)
    return res.status(200).json({ ok: true })
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET')
    return res.status(405).end('Method Not Allowed')
  }

  const { sourceUrl, audioFormat } = req.body ?? {}
  if (!sourceUrl || typeof sourceUrl !== 'string') {
    return res.status(400).json({ error: 'sourceUrl required' })
  }

  const workerUrl = process.env.WORKER_URL || 'http://localhost:8080'
  const jobId = newId()

  // Kick off the worker in track mode (polling); no callback yet
  try {
    const resp = await fetch(`${workerUrl}/download?track=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, sourceUrl, audioFormat }),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      console.error('worker /download non-2xx', { status: resp.status, body: text })
      return res.status(502).json({ error: 'worker /download failed', status: resp.status, body: text })
    }
  } catch (err) {
    console.error('worker /download request error', err)
    return res.status(502).json({ error: 'failed to contact worker', details: String(err) })
  }

  putJob({ id: jobId, status: 'working', workerUrl })
  const statusUrl = `/api/downloads/${jobId}`
  return res.status(202).json({ jobId, statusUrl })
}
