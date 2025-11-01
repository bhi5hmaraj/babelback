/** Lightweight wrapper that lazily creates a Redis client when REDIS_KV_REDIS_URL is set. */
import { createClient } from 'redis'

// Keep types loose to avoid @redis/* type clashes in serverless bundlers.
let clientPromise: Promise<any> | null = null
let disabled = false
let loggedFailure = false

export async function getRedis(): Promise<any | null> {
  if (disabled || process.env.REDIS_DISABLE === '1' || process.env.REDIS_DISABLE === 'true') {
    console.log('[redis:getRedis] Redis is disabled')
    return null
  }
  if (clientPromise) {
    console.log('[redis:getRedis] Reusing existing Redis connection')
    return clientPromise
  }
  const url = process.env.REDIS_KV_REDIS_URL
  if (!url) {
    console.warn('[redis:getRedis] REDIS_KV_REDIS_URL not configured')
    return null
  }

  console.log('[redis:getRedis] Creating new Redis client...')
  const client = createClient({ url })
  client.on('error', (err) => {
    if (!loggedFailure) {
      console.error('[redis] Client error:', err?.message || String(err))
      loggedFailure = true
    }
  })

  const connectTimeoutMs = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 1000)
  console.log('[redis:getRedis] Connecting with timeout:', connectTimeoutMs, 'ms')

  const connectPromise = client.connect().then(() => {
    console.log('[redis:getRedis] ✓ Connection successful')
    return client
  })
  const timeoutPromise = new Promise((_res, rej) => setTimeout(() => rej(new Error('connect-timeout')), connectTimeoutMs))
  clientPromise = Promise.race([connectPromise, timeoutPromise]) as Promise<any>

  try {
    const c = await clientPromise
    return c
  } catch (e) {
    if (!loggedFailure) {
      console.error('[redis:getRedis] ✗ Connect failed:', e instanceof Error ? e.message : String(e))
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
  if (!redis) {
    console.warn('[redis:redisSet] Redis not available, skipping set')
    return
  }
  console.log('[redis:redisSet] Setting key:', { key: key.substring(0, 50), ttl: ttlSeconds })
  if (ttlSeconds && ttlSeconds > 0) await redis.set(key, value, { EX: ttlSeconds })
  else await redis.set(key, value)
  console.log('[redis:redisSet] ✓ Set successful')
}

/** Get a string value or null. No-op when Redis unavailable. */
export async function redisGet(key: string): Promise<string | null> {
  const redis = await getRedis()
  if (!redis) {
    console.warn('[redis:redisGet] Redis not available, returning null')
    return null
  }
  console.log('[redis:redisGet] Getting key:', { key: key.substring(0, 50) })
  const result = await redis.get(key)
  console.log('[redis:redisGet]', result ? '✓ Found' : '✗ Not found', { key: key.substring(0, 50) })
  return result
}
