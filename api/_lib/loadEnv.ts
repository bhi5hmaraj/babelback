import dotenv from 'dotenv'

// Load local env files for `vercel dev` or plain Node runs.
// In Vercel production, real env vars are injected and these files are absent.
try {
  // Prefer .env.local if present; fall back to default .env
  const r1 = dotenv.config({ path: '.env.local' })
  if (r1.error) {
    dotenv.config()
  }
} catch {}

