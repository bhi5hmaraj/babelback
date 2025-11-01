declare global {
  interface Window {
    __BB_DEBUG__?: boolean
  }
}

export function isDebug(): boolean {
  try {
    // Client-side toggle via localStorage
    if (typeof window !== 'undefined') {
      if (window.__BB_DEBUG__) return true
      if (window.localStorage.getItem('bb:debug') === '1') return true
      if (document.cookie && /(^|;\s*)bb_debug=1(\s*;|$)/.test(document.cookie)) return true
    }
  } catch {}
  // Env toggles (client/server)
  if (process.env.NEXT_PUBLIC_BB_DEBUG === '1') return true
  if (process.env.NEXT_PUBLIC_BB_DEBUG_DEFAULT === '1') return true
  if (process.env.BB_DEBUG === '1') return true
  if (process.env.BB_DEBUG_DEFAULT === '1') return true
  return process.env.NODE_ENV === 'development'
}

export function dbg(tag: string, ...args: any[]) {
  if (!isDebug()) return
  try {
    // eslint-disable-next-line no-console
    console.log(`[${tag}]`, ...args)
  } catch {}
}

export function dberr(tag: string, ...args: any[]) {
  try {
    // eslint-disable-next-line no-console
    console.error(`[${tag}]`, ...args)
  } catch {}
}
