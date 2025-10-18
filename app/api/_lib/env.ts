import fs from 'node:fs'
import path from 'node:path'

let loggedSummary = false

/** Parse a simple KEY=VALUE .env style file and return the list of keys. */
function parseEnvFile(filePath: string): string[] {
  try {
    const abs = path.resolve(process.cwd(), filePath)
    if (!fs.existsSync(abs)) return []
    const content = fs.readFileSync(abs, 'utf8')
    const keys = new Set<string>()
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eqIndex = line.indexOf('=')
      if (eqIndex <= 0) continue
      const key = line.slice(0, eqIndex).trim()
      if (key) keys.add(key)
    }
    return Array.from(keys)
  } catch {
    return []
  }
}

const KNOWN_PREFIXES = [
  'GA_',
  'GEMINI',
  'APIFY_',
  'GCS_',
  'GCP_',
  'REDIS',
  'KV_',
  'CALLBACK_',
  'PYTHON_',
  'BLOB_',
  'NEXT_PUBLIC_',
  'VERCEL_',
  'AI_',
]

/**
 * Log the known environment keys (no values) once during dev to help diagnose dotenv loading.
 */
export function logEnvSummaryOnce(): void {
  if (loggedSummary || process.env.NODE_ENV === 'production') return
  loggedSummary = true
  try {
    const files = ['.env.local', '.env']
    const declaredKeySet = new Set<string>()
    for (const file of files) {
      const keys = parseEnvFile(file)
      if (keys.length) {
        console.log(`[env] ${file} keys (${keys.length})`, keys.sort())
        keys.forEach((k) => declaredKeySet.add(k))
      }
    }

    const runtimeKeys = new Set<string>()
    const interesting = declaredKeySet.size > 0
      ? (key: string) => declaredKeySet.has(key) || KNOWN_PREFIXES.some((prefix) => key.startsWith(prefix))
      : (key: string) => KNOWN_PREFIXES.some((prefix) => key.startsWith(prefix)) || (/^[A-Z0-9_]+$/.test(key) && !key.startsWith('npm_'))

    for (const key of Object.keys(process.env)) {
      if (interesting(key)) runtimeKeys.add(key)
    }

    if (runtimeKeys.size) {
      console.log('[env] runtime keys', Array.from(runtimeKeys).sort())
    }
  } catch (err) {
    console.warn('[env] summary log failed', (err as Error)?.message)
  }
}

