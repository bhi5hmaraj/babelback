import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getJob } from '../_lib/downloadJobs'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }
  const { id } = req.query
  const jobId = Array.isArray(id) ? id[0] : id
  if (!jobId) return res.status(400).json({ error: 'missing id' })
  const job = getJob(jobId)
  if (!job) return res.status(404).json({ error: 'job not found' })
  return res.status(200).json({ id: job.id, status: job.status, url: job.url, gcsObject: job.gcsObject, error: job.error })
}

