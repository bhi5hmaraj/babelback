import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getJob, updateJob } from '../_lib/downloadJobs'

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

  // Poll Apify run status if we're still running and we have a run id
  if (job.status === 'running' && job.apifyRunId && process.env.APIFY_TOKEN) {
    try {
      const runUrl = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(job.apifyRunId)}?token=${encodeURIComponent(process.env.APIFY_TOKEN!)}`
      const resp = await fetch(runUrl)
      if (resp.ok) {
        const data = await resp.json().catch(() => ({} as any))
        const status = (data?.data?.status as string | undefined) || ''
        if (status === 'SUCCEEDED') {
          updateJob(jobId, { status: 'completed' })
        } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
          updateJob(jobId, { status: 'failed', error: { message: status } })
        }
      }
    } catch {}
  }

  const current = getJob(jobId)!
  return res.status(200).json({ id: current.id, status: current.status, url: current.url, gcsObject: current.gcsObject, error: current.error })
}
