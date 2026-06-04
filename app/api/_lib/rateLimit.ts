/**
 * Lightweight per-IP rate limiting for the public API.
 *
 * Uses Redis (cross-instance, atomic INCR) when configured, and falls back to
 * an in-memory fixed-window counter. NOTE: the in-memory fallback is
 * per-serverless-instance and therefore best-effort only — configure Redis
 * (REDIS_KV_REDIS_URL) for meaningful limits across instances.
 */
import { NextRequest, NextResponse } from 'next/server'
import { redisIncr } from './redis'

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  const first = xff.split(',')[0]?.trim()
  if (first) return first
  return req.headers.get('x-real-ip') || 'unknown'
}

interface Window {
  count: number
  resetAt: number
}
const memory = new Map<string, Window>()

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

export async function rateLimit(
  bucket: string,
  ip: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const key = `rl:${bucket}:${ip}`

  // Prefer Redis for cross-instance accuracy.
  try {
    const count = await redisIncr(key, windowSec)
    if (count != null) {
      const ok = count <= limit
      return { ok, remaining: Math.max(0, limit - count), retryAfterSec: ok ? 0 : windowSec }
    }
  } catch {
    // fall through to in-memory
  }

  // In-memory fixed window (per-instance, best-effort).
  const now = Date.now()
  const cur = memory.get(key)
  if (!cur || cur.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 })
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 }
  }
  cur.count += 1
  const ok = cur.count <= limit
  return {
    ok,
    remaining: Math.max(0, limit - cur.count),
    retryAfterSec: ok ? 0 : Math.ceil((cur.resetAt - now) / 1000),
  }
}

/**
 * Enforce a rate limit for the given request. Returns a 429 NextResponse when
 * the limit is exceeded, or null when the request may proceed.
 */
export async function enforceRateLimit(
  req: NextRequest,
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<NextResponse | null> {
  const ip = getClientIp(req)
  const result = await rateLimit(bucket, ip, limit, windowSec)
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down and try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } },
    )
  }
  return null
}
