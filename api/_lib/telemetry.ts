import { redisGet, redisSet } from './redis.js'
import { getRedis } from './redis.js'

/** Simple telemetry helpers backed by Redis (no-op when Redis unavailable). */

function dayKey(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${dd}`
}

async function redisIncrBy(key: string, by = 1): Promise<number | null> {
  const client = await getRedis()
  if (!client) return null
  try { return await client.incrBy(key, by) } catch { return null }
}

async function redisLPush(key: string, val: string, maxLen = 1000) {
  const client = await getRedis()
  if (!client) return
  try {
    await client.lPush(key, val)
    await client.lTrim(key, 0, maxLen - 1)
  } catch {}
}

/** Record a telemetry event with lightweight aggregates. */
export async function tLog(event: string, props: Record<string, any> = {}) {
  const today = dayKey()
  const base = `telemetry:${event}:${today}`
  try { await redisIncrBy(`${base}:count`, 1) } catch {}
  // Duration aggregates (ms)
  if (typeof props.durationMs === 'number') {
    try {
      await redisIncrBy(`${base}:dur_count`, 1)
      await redisIncrBy(`${base}:dur_sum`, Math.max(0, Math.floor(props.durationMs)))
    } catch {}
  }
  // File size histograms (MB bucket)
  const size = typeof props.sizeBytes === 'number' ? props.sizeBytes : undefined
  if (size != null && size >= 0) {
    const mb = Math.max(0, Math.ceil(size / (1024 * 1024)))
    const bucket = Math.min(256, mb)
    try { await redisIncrBy(`${base}:size_mb_bucket:${bucket}`, 1) } catch {}
  }
  // Keep a small rolling sample of raw events for debugging
  const sample = { ts: Date.now(), event, props: redaction(props) }
  try { await redisLPush(`telemetry:events:${today}`, JSON.stringify(sample), 500) } catch {}
}

function redaction(props: Record<string, any>) {
  // Avoid storing URLs or PII; keep coarse metadata only
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(props)) {
    if (/url/i.test(k)) continue
    if (/cookie|token|secret|key/i.test(k)) continue
    out[k] = v
  }
  return out
}

