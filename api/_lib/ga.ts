/**
 * Minimal GA4 Measurement Protocol helper.
 * Sends server-side events without tying to a specific client.
 * Requires env: GA_MEASUREMENT_ID (e.g., G-XXXX), GA_API_SECRET
 */

import { randomUUID } from 'node:crypto'

type Params = Record<string, unknown>

function sanitize(params?: Params): Record<string, string | number> | undefined {
  if (!params) return undefined
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number') out[k] = v
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0
    else out[k] = String(v)
  }
  return out
}

export async function gaEvent(name: string, params?: Params, clientId?: string) {
  const measurementId = process.env.GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  const apiSecret = process.env.GA_API_SECRET
  if (!measurementId || !apiSecret) return // GA disabled on server
  const endpoint = process.env.GA_DEBUG === '1'
    ? 'https://www.google-analytics.com/debug/mp/collect'
    : 'https://www.google-analytics.com/mp/collect'

  const cid = clientId || `srv.${randomUUID()}`
  const body = {
    client_id: cid,
    non_personalized_ads: true,
    events: [ { name, params: sanitize(params) } ],
  }
  const url = `${endpoint}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`
  try {
    const resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!resp.ok && process.env.GA_DEBUG === '1') {
      const txt = await resp.text().catch(() => '')
      console.warn('[ga] server event failed', resp.status, txt?.slice?.(0, 200))
    }
  } catch (e) {
    if (process.env.GA_DEBUG === '1') console.warn('[ga] error', (e as Error).message)
  }
}

