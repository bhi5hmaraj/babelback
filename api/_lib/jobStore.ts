/**
 * Job store abstraction over in-memory map with optional Redis / Vercel KV backing.
 * Provides:
 *  - putJob/getJob/updateJob for job lifecycle
 *  - source URL → jobId mapping helpers (setJobIdForSource/getJobIdBySource)
 */
import crypto from 'node:crypto'

/** Status of a download job. */
export type JobStatus = 'queued' | 'working' | 'completed' | 'failed'

/** Persisted job record used by API routes. */
export interface JobRecord {
  id: string
  status: JobStatus
  url?: string
  gcsObject?: { bucket: string; path: string; contentType?: string; size?: number }
  error?: { message: string }
  workerUrl: string
  apifyRunId?: string
  sourceUrl?: string
  startedAtMs?: number
  metricsSent?: boolean
}

const jobs = new Map<string, JobRecord>()
const JOB_TTL_SECONDS = Number(process.env.JOBS_TTL_SECONDS || 48 * 60 * 60)

import { redisGet, redisSet } from './redis.js'

const kvUrl = process.env.KV_REST_API_URL
const kvToken = process.env.KV_REST_API_TOKEN
const useRestKv = Boolean(kvUrl && kvToken)

async function kvSet(key: string, value: string, ttlSec?: number) {
  // Prefer Redis client if configured
  if (process.env.REDIS_KV_REDIS_URL) {
    try { await redisSet(key, value, ttlSec) } catch {}
    return
  }
  if (!useRestKv) return
  const url = `${kvUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}${ttlSec ? `?EX=${ttlSec}` : ''}`
  const resp = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${kvToken}` } })
  if (!resp.ok) throw new Error(`KV set failed: ${resp.status}`)
}

async function kvGet(key: string): Promise<string | null> {
  if (process.env.REDIS_KV_REDIS_URL) {
    try { return await redisGet(key) } catch { return null }
  }
  if (!useRestKv) return null
  const url = `${kvUrl}/get/${encodeURIComponent(key)}`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${kvToken}` } })
  if (!resp.ok) return null
  try {
    const data = await resp.json()
    if (typeof data?.result === 'string') return data.result
    if (typeof data === 'string') return data
    return JSON.stringify(data)
  } catch {
    try { return await resp.text() } catch { return null }
  }
}

/** Create a uuid for new jobs. */
export function newId() {
  return crypto.randomUUID()
}

/** Insert or replace a job record in caches and KV. */
export async function putJob(rec: JobRecord) {
  jobs.set(rec.id, rec)
  try { await kvSet(`downloads:${rec.id}`, JSON.stringify(rec), JOB_TTL_SECONDS) } catch {}
}

/** Retrieve job from memory or KV; rehydrates memory cache when found. */
export async function getJob(id: string) {
  const inMem = jobs.get(id)
  if (inMem) {
    try { console.log('[jobStore] cache hit (memory)', { id }) } catch {}
    return inMem
  }
  const raw = await kvGet(`downloads:${id}`)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as JobRecord
    // Refresh in-memory cache for this instance
    jobs.set(id, parsed)
    try { console.log('[jobStore] cache hit (kv)', { id, backend: process.env.REDIS_KV_REDIS_URL ? 'redis' : (useRestKv ? 'vercel-kv-rest' : 'none') }) } catch {}
    return parsed
  } catch {
    return undefined
  }
}

/** Update an existing record and persist back to KV. */
export async function updateJob(id: string, patch: Partial<JobRecord>) {
  const cur = await getJob(id)
  if (!cur) return undefined
  const next = { ...cur, ...patch, id }
  jobs.set(id, next)
  try { await kvSet(`downloads:${id}`, JSON.stringify(next), JOB_TTL_SECONDS) } catch {}
  return next
}

// --------- Source URL ↔ Job mapping helpers ---------

function sourceKey(url: string) {
  const hash = crypto.createHash('sha1').update(url.trim()).digest('hex')
  return `downloads:src:${hash}`
}

/** Map a source URL hash → jobId with TTL. */
export async function setJobIdForSource(url: string, jobId: string) {
  try { await kvSet(sourceKey(url), jobId, JOB_TTL_SECONDS) } catch {}
}

/** Resolve jobId for a given source URL if known. */
export async function getJobIdBySource(url: string): Promise<string | null> {
  try {
    const val = await kvGet(sourceKey(url))
    if (typeof val === 'string' && val.length > 0) return val
    return null
  } catch {
    return null
  }
}
