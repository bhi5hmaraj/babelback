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
    const p = sanitize(props)
    ;(window as any)?.gtag?.('event', name, p)
  } catch {
    // no-op in dev or when analytics is disabled
  }
}
