// Lightweight GA4 wrapper. Safe to import from anywhere in the client bundle.
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
    const p = sanitize(props) || {}
    if (p.origin === undefined) p.origin = 'client'
    // Enable DebugView on localhost or when explicitly requested
    const isDebug = (() => {
      try {
        const q = /([?&])debug_view=1(&|$)/.test(location.search)
        const ls = localStorage.getItem('GA_DEBUG') === '1'
        const dev = Boolean(process?.env?.NODE_ENV && process.env.NODE_ENV !== 'production')
        const hostDebug = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        return Boolean(q || ls || dev || hostDebug)
      } catch { return false }
    })()
    if (isDebug) (p as any).debug_mode = true
    ;(window as any)?.gtag?.('event', name, p as any)
  } catch {
    // no-op in dev or when analytics is disabled
  }
}
