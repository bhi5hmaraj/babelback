// Lightweight wrapper around Vercel Analytics custom events.
// Safe to import from anywhere in the client bundle.
import { track as trackReact } from '@vercel/analytics/react'

type Props = Record<string, string | number | boolean | null | undefined>

function sanitize(props?: Props): Record<string, string | number> | undefined {
  if (!props) return undefined
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number') out[k] = v
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0
    else out[k] = String(v)
  }
  return out
}

export function trackEvent(name: string, props?: Props) {
  try {
    const p = sanitize(props)
    // Try the React helper first
    trackReact(name, p)
  } catch {
    try {
      // Fallback to the global if available
      ;(window as any)?.va?.track?.(name, sanitize(props))
    } catch {
      // no-op in dev or when analytics is disabled
    }
  }
}

