/**
 * Minimal GA4 Measurement Protocol helper.
 * Sends server-side events without tying to a specific client.
 * Requires env: GA_MEASUREMENT_ID (e.g., G-XXXX), GA_API_SECRET
 */

import { randomUUID } from 'node:crypto'
import { logEnvSummaryOnce } from './env'

let loggedGaKeys = false

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
  logEnvSummaryOnce()
  if (!loggedGaKeys && process.env.NODE_ENV !== 'production') {
    loggedGaKeys = true
    try {
      const keys = Object.keys(process.env).filter((k) => k.startsWith('GA_'))
      console.log('[ga] env keys', keys)
    } catch {}
  }
  if (!measurementId || !apiSecret) return // GA disabled on server
  const endpoints = ['https://www.google-analytics.com/mp/collect']
  const wantDebug = process.env.GA_DEBUG === '1'
  if (wantDebug) endpoints.push('https://www.google-analytics.com/debug/mp/collect')

  const cid = clientId || `srv.${randomUUID()}`
  const sanitized = sanitize(params) as Record<string, any> | undefined
  const finalParams: Record<string, any> = sanitized ? { ...sanitized } : {}
  if (finalParams.origin == null) finalParams.origin = 'server'
  if (wantDebug) {
    // Tag events for DebugView
    finalParams.debug_mode = 1
  }
  const body = {
    client_id: cid,
    non_personalized_ads: true,
    events: [ { name, params: finalParams } ],
  }
  const qs = `measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`
  try {
    for (const ep of endpoints) {
      const resp = await fetch(`${ep}?${qs}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!resp.ok && wantDebug) {
        const txt = await resp.text().catch(() => '')
        console.warn('[ga] server event failed', ep, resp.status, txt?.slice?.(0, 300))
      }
      // For debug/mp/collect, log validation messages to help troubleshooting
      if (ep.includes('/debug/')) {
        try {
          const j = await resp.json()
          if (Array.isArray(j?.validationMessages) && j.validationMessages.length) {
            console.warn('[ga] validation', j.validationMessages)
          }
        } catch {}
      }
    }
  } catch (e) {
    if (wantDebug) console.warn('[ga] error', (e as Error).message)
  }
}
