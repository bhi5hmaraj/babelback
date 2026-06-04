/**
 * Helpers for validating Google Cloud Storage hosts/URLs and bucket allowlists.
 *
 * Used to harden endpoints that fetch or proxy URLs (SSRF protection) and to
 * scope signed-URL minting to buckets we actually own.
 *
 * Allowed buckets come from GCS_BUCKET plus an optional comma-separated
 * GCS_ALLOWED_BUCKETS (e.g. for seed data living in a separate bucket).
 */

const GCS_HOSTS = new Set(['storage.googleapis.com'])

/** The set of buckets this deployment is allowed to read/proxy from. */
export function allowedBuckets(): string[] {
  const set = new Set<string>()
  const primary = (process.env.GCS_BUCKET || '').trim()
  if (primary) set.add(primary)
  for (const b of (process.env.GCS_ALLOWED_BUCKETS || '').split(',')) {
    const t = b.trim()
    if (t) set.add(t)
  }
  return Array.from(set)
}

/** True when `bucket` is in the configured allowlist. Empty allowlist => deny. */
export function isBucketAllowed(bucket: string): boolean {
  const allowed = allowedBuckets()
  if (allowed.length === 0) return false
  return allowed.includes(bucket)
}

/** Parse a URL and require it to be on a known GCS host. Returns null otherwise. */
export function parseGcsUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (!GCS_HOSTS.has(u.hostname)) return null
  return u
}

/**
 * True when `raw` is a GCS URL on an allowed bucket.
 * Signed URLs have the form https://storage.googleapis.com/<bucket>/<object>...
 * If no buckets are configured we fall back to a host-only restriction.
 */
export function isAllowedGcsUrl(raw: string): boolean {
  const u = parseGcsUrl(raw)
  if (!u) return false
  const allowed = allowedBuckets()
  if (allowed.length === 0) return true
  return allowed.some((b) => u.pathname.startsWith(`/${b}/`))
}

/**
 * True for the Apify key-value-store record URL the download actor emits as a
 * fallback when it can't upload to GCS (https://api.apify.com/v2/key-value-stores/…).
 * The callback route already trusts this host, so analysis/proxy must too.
 */
export function isApifyKvsUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return (
      u.protocol === 'https:' &&
      u.hostname === 'api.apify.com' &&
      u.pathname.startsWith('/v2/key-value-stores/')
    )
  } catch {
    return false
  }
}

/**
 * Sources we trust to fetch/proxy audio from: our own GCS buckets plus the
 * Apify KVS fallback. Used by /api/song-analysis (server fetch) and /api/proxy.
 */
export function isAllowedAudioUrl(raw: string): boolean {
  return isAllowedGcsUrl(raw) || isApifyKvsUrl(raw)
}
