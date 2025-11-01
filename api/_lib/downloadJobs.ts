import crypto from 'node:crypto'

export type JobStatus = 'queued' | 'working' | 'completed' | 'failed'

export interface JobRecord {
  id: string
  status: JobStatus
  url?: string
  gcsObject?: { bucket: string; path: string; contentType?: string; size?: number }
  error?: { message: string }
  workerUrl: string
  apifyRunId?: string
}

// In-memory job store for download tasks. Dev/local only.
const jobs = new Map<string, JobRecord>()

export function newId() {
  return crypto.randomUUID()
}

export function putJob(rec: JobRecord) {
  jobs.set(rec.id, rec)
}

export function getJob(id: string) {
  return jobs.get(id)
}

export function updateJob(id: string, patch: Partial<JobRecord>) {
  const cur = jobs.get(id)
  if (!cur) return
  const next = { ...cur, ...patch, id }
  jobs.set(id, next)
  return next
}
