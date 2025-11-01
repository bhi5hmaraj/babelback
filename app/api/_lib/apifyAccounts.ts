import './loadEnv'
import { redisGet, redisSet } from './redis'

export interface ApifyAccountConfig {
  label: string
  token: string
  actorId?: string
  taskId?: string
  proxyConfiguration?: Record<string, unknown>
  inputDefaults?: Record<string, unknown>
}

const REDIS_KEY = process.env.APIFY_ACCOUNTS_REDIS_KEY || 'apify:accounts'
const CACHE_TTL_MS = Number(process.env.APIFY_ACCOUNTS_CACHE_MS || 30_000)

let cached: { configs: ApifyAccountConfig[]; fetchedAt: number } | null = null
let loggedInitialConfigs = false

function maskSecret(secret?: string) {
  if (!secret) return ''
  if (secret.length <= 8) return '*'.repeat(secret.length)
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`
}

export function normalizeApifyAccountsConfig(value: unknown): ApifyAccountConfig[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const obj = item as Record<string, unknown>
      const label = typeof obj.label === 'string' ? obj.label : undefined
      const token = typeof obj.token === 'string' ? obj.token : undefined
      if (!label || !token) return null
      const actorId = typeof obj.actorId === 'string' ? obj.actorId : undefined
      const taskId = typeof obj.taskId === 'string' ? obj.taskId : undefined
      const proxyConfiguration = obj.proxyConfiguration && typeof obj.proxyConfiguration === 'object'
        ? (obj.proxyConfiguration as Record<string, unknown>)
        : undefined
      const inputDefaults = obj.inputDefaults && typeof obj.inputDefaults === 'object'
        ? (obj.inputDefaults as Record<string, unknown>)
        : undefined
      return { label, token, actorId, taskId, proxyConfiguration, inputDefaults }
    })
    .filter((item): item is ApifyAccountConfig => Boolean(item))
}

function fallbackFromEnv(): ApifyAccountConfig[] {
  const token = process.env.APIFY_TOKEN
  const actorId = process.env.APIFY_ACTOR_ID
  if (!token) return []
  const label = process.env.APIFY_ACCOUNT_LABEL || 'default'
  return [{ label, token, actorId }]
}

export async function loadApifyAccounts(forceReload = false): Promise<ApifyAccountConfig[]> {
  if (!forceReload && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.configs
  }

  let parsed: ApifyAccountConfig[] = []
  try {
    const raw = await redisGet(REDIS_KEY)
    if (raw) {
      const maybeJson = JSON.parse(raw)
      parsed = normalizeApifyAccountsConfig(maybeJson)
    }
  } catch (err) {
    console.warn('[apifyAccounts] Failed to load configs from Redis', err instanceof Error ? err.message : err)
    parsed = []
  }

  if (!parsed.length) {
    parsed = fallbackFromEnv()
  }

  cached = { configs: parsed, fetchedAt: Date.now() }

  if (!loggedInitialConfigs && parsed.length) {
    loggedInitialConfigs = true
    try {
      console.log('[apifyAccounts] Loaded configs:', parsed.map((cfg) => ({
        label: cfg.label,
        actor: cfg.actorId ? 'actor' : undefined,
        task: cfg.taskId ? 'task' : undefined,
        token: maskSecret(cfg.token),
      })))
    } catch {}
  }
  return parsed
}

export async function getApifyAccount(label: string): Promise<ApifyAccountConfig | undefined> {
  const configs = await loadApifyAccounts()
  return configs.find((cfg) => cfg.label === label)
}

export async function storeApifyAccounts(configs: ApifyAccountConfig[]) {
  cached = { configs, fetchedAt: Date.now() }
  await redisSet(REDIS_KEY, JSON.stringify(configs))
}
