/** Lightweight wrapper that lazily creates a Redis client when REDIS_KV_REDIS_URL is set. */
import { createClient } from 'redis'

// Keep types loose to avoid @redis/* type clashes in serverless bundlers.
let clientPromise: Promise<any> | null = null
let disabled = false
let loggedFailure = false

export async function getRedis(): Promise<any | null> {
  if (disabled || process.env.REDIS_DISABLE === '1' || process.env.REDIS_DISABLE === 'true') return null
  if (clientPromise) return clientPromise
  const url = process.env.REDIS_KV_REDIS_URL
  if (!url) return null
  const client = createClient({ url })
  client.on('error', (err) => {
    if (!loggedFailure) {
      try { console.error('[redis] client error', err?.message || String(err)) } catch {}
      loggedFailure = true
    }
  })
  const connectTimeoutMs = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 1000)
  const connectPromise = client.connect().then(() => client)
  const timeoutPromise = new Promise((_res, rej) => setTimeout(() => rej(new Error('connect-timeout')), connectTimeoutMs))
  clientPromise = Promise.race([connectPromise, timeoutPromise]) as Promise<any>
  try {
    const c = await clientPromise
    return c
  } catch (e) {
    if (!loggedFailure) {
      try { console.error('[redis] connect failed', e instanceof Error ? e.message : String(e)) } catch {}
      loggedFailure = true
    }
    try { await client.quit().catch(() => {}) } catch {}
    clientPromise = null
    disabled = true
    return null
  }
}

/** Set a string value with optional TTL (seconds). No-op when Redis unavailable. */
export async function redisSet(key: string, value: string, ttlSeconds?: number) {
  const redis = await getRedis()
  if (!redis) return
  if (ttlSeconds && ttlSeconds > 0) await redis.set(key, value, { EX: ttlSeconds })
  else await redis.set(key, value)
}

/** Get a string value or null. No-op when Redis unavailable. */
export async function redisGet(key: string): Promise<string | null> {
  const redis = await getRedis()
  if (!redis) return null
  return await redis.get(key)
}
