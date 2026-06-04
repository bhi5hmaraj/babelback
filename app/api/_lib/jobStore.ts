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
  apifyAccountLabel?: string
  apifyDatasetId?: string
  apifyKeyValueStoreId?: string
  apifyStatus?: string
  sourceUrl?: string
  startedAtMs?: number
  metricsSent?: boolean
}

const jobs = new Map<string, JobRecord>()
const JOB_TTL_SECONDS = Number(process.env.JOBS_TTL_SECONDS || 48 * 60 * 60)

import { redisGet, redisSet } from './redis'

const kvUrl = process.env.KV_REST_API_URL
const kvToken = process.env.KV_REST_API_TOKEN
const useRestKv = Boolean(kvUrl && kvToken)

async function kvSet(key: string, value: string, ttlSec?: number) {
  // Prefer Redis client if configured
  if (process.env.REDIS_KV_REDIS_URL) {
    console.log('[jobStore:kvSet] Using Redis client:', { key: key.substring(0, 50) })
    try {
      await redisSet(key, value, ttlSec)
      console.log('[jobStore:kvSet] ✓ Redis set successful:', { key: key.substring(0, 50) })
    } catch (err) {
      console.error('[jobStore:kvSet] ✗ Redis set failed:', { key: key.substring(0, 50), error: err instanceof Error ? err.message : String(err) })
      throw err
    }
    return
  }
  if (!useRestKv) {
    console.warn('[jobStore:kvSet] No KV backend configured (no Redis, no Vercel KV)')
    return
  }
  // Send the value in the request body (Upstash/Vercel KV REST supports this)
  // rather than the URL path, which would break on large job records.
  const url = `${kvUrl}/set/${encodeURIComponent(key)}${ttlSec ? `?EX=${ttlSec}` : ''}`
  const resp = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${kvToken}` }, body: value })
  if (!resp.ok) throw new Error(`KV set failed: ${resp.status}`)
}

async function kvGet(key: string): Promise<string | null> {
  if (process.env.REDIS_KV_REDIS_URL) {
    console.log('[jobStore:kvGet] Using Redis client:', { key: key.substring(0, 50) })
    try {
      const result = await redisGet(key)
      if (result) {
        console.log('[jobStore:kvGet] ✓ Redis get successful:', { key: key.substring(0, 50), size: result.length })
      } else {
        console.log('[jobStore:kvGet] Redis get returned null/empty:', { key: key.substring(0, 50) })
      }
      return result
    } catch (err) {
      console.error('[jobStore:kvGet] ✗ Redis get failed:', { key: key.substring(0, 50), error: err instanceof Error ? err.message : String(err) })
      return null
    }
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
  console.log('[jobStore:putJob] Storing job in memory:', { id: rec.id, status: rec.status })
  try {
    await kvSet(`downloads:${rec.id}`, JSON.stringify(rec), JOB_TTL_SECONDS)
    console.log('[jobStore:putJob] ✓ Stored in KV/Redis:', { id: rec.id })
  } catch (err) {
    console.error('[jobStore:putJob] ✗ Failed to store in KV/Redis:', { id: rec.id, error: err instanceof Error ? err.message : String(err) })
  }
}

/** Retrieve job from memory or KV; rehydrates memory cache when found. */
export async function getJob(id: string) {
  console.log('[jobStore:getJob] Looking up job:', { id, hasRedis: !!process.env.REDIS_KV_REDIS_URL })

  const inMem = jobs.get(id)
  if (inMem) {
    console.log('[jobStore:getJob] ✓ Cache hit (memory)', { id, status: inMem.status })
    return inMem
  }

  console.log('[jobStore:getJob] Cache miss (memory), checking KV/Redis...')
  const raw = await kvGet(`downloads:${id}`)

  if (!raw) {
    console.log('[jobStore:getJob] ✗ Not found in KV/Redis', { id })
    return undefined
  }

  try {
    const parsed = JSON.parse(raw) as JobRecord
    // Refresh in-memory cache for this instance
    jobs.set(id, parsed)
    console.log('[jobStore:getJob] ✓ Cache hit (KV/Redis)', {
      id,
      status: parsed.status,
      backend: process.env.REDIS_KV_REDIS_URL ? 'redis' : (useRestKv ? 'vercel-kv-rest' : 'none')
    })
    return parsed
  } catch (err) {
    console.error('[jobStore:getJob] ✗ Failed to parse KV data', { id, error: err instanceof Error ? err.message : String(err) })
    return undefined
  }
}

/** Update an existing record and persist back to KV. */
export async function updateJob(id: string, patch: Partial<JobRecord>) {
  const cur = await getJob(id)
  if (!cur) return undefined
  const next = { ...cur, ...patch, id }
  // Deep-merge gcsObject so a partial patch (e.g. callback sending only
  // contentType/size) does not clobber bucket/path.
  if (patch.gcsObject) {
    next.gcsObject = { ...cur.gcsObject, ...patch.gcsObject } as JobRecord['gcsObject']
  }
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
