import '../_lib/loadEnv'
import { getRedis } from '../_lib/redis.js'

interface VercelRequest {
  method?: string
  query?: Record<string, string | string[] | undefined>
}
interface VercelResponse {
  status: (code: number) => VercelResponse
  json: (b: unknown) => void
}

function dayKey(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${dd}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET') { res.status(405).json({ error: 'Method not allowed. Use GET.' }); return }

  const redis = await getRedis()
  if (!redis) { res.status(200).json({ ok: false, error: 'redis unavailable' }); return }

  const q = req.query || {}
  const day = (Array.isArray(q.day) ? q.day[0] : q.day) || dayKey()
  const limitStr = (Array.isArray(q.limit) ? q.limit[0] : q.limit) || '25'
  const limit = Math.max(1, Math.min(200, parseInt(String(limitStr), 10) || 25))

  const events = [
    'upload_start','upload_done','upload_error',
    'analysis_start','analysis_done','analysis_error'
  ]

  const metrics: any = { day, events: {} }
  try {
    await Promise.all(events.map(async (ev) => {
      const base = `telemetry:${ev}:${day}`
      const [count, durCount, durSum] = await redis
        .mGet([`${base}:count`, `${base}:dur_count`, `${base}:dur_sum`])
        .catch(() => [null, null, null])
      const c = count ? parseInt(count, 10) : 0
      const dc = durCount ? parseInt(durCount, 10) : 0
      const ds = durSum ? parseInt(durSum, 10) : 0
      const avgMs = dc > 0 ? Math.round(ds / dc) : null
      metrics.events[ev] = { count: c, durationAvgMs: avgMs }
    }))
  } catch {}

  // Recent samples (already redacted in writer)
  let samples: any[] = []
  try {
    const raw = await redis.lRange(`telemetry:events:${day}`, 0, limit - 1)
    samples = (raw || []).map((s: string) => { try { return JSON.parse(s) } catch { return { raw: s } } })
  } catch {}

  res.status(200).json({ ok: true, metrics, samples })
}
