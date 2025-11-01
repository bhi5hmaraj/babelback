#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs/promises'

import '../app/api/_lib/loadEnv'
import { normalizeApifyAccountsConfig, storeApifyAccounts, loadApifyAccounts } from '../app/api/_lib/apifyAccounts'

function maskSecret(secret: string | undefined) {
  if (!secret) return ''
  if (secret.length <= 8) return '*'.repeat(secret.length)
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`
}

function buildFallbackConfig() {
  const token = process.env.APIFY_TOKEN
  if (!token) return []
  return normalizeApifyAccountsConfig([
    {
      label: process.env.APIFY_ACCOUNT_LABEL || 'default',
      token,
      actorId: process.env.APIFY_ACTOR_ID,
    },
  ])
}

async function readConfigFromFile(filePath: string) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  const content = await fs.readFile(resolved, 'utf8')
  try {
    return JSON.parse(content)
  } catch (err) {
    throw new Error(`Failed to parse JSON from ${resolved}: ${(err as Error).message}`)
  }
}

async function resolveConfigs(argv: string[]): Promise<ReturnType<typeof normalizeApifyAccountsConfig>> {
  const inputPath = argv.find((arg) => !arg.startsWith('--'))
  const inlineJson = process.env.APIFY_ACCOUNTS_JSON

  let raw: unknown

  if (inputPath) {
    raw = await readConfigFromFile(inputPath)
  } else if (inlineJson) {
    raw = JSON.parse(inlineJson)
  } else {
    const fallback = buildFallbackConfig()
    if (fallback.length) return fallback
    raw = await loadApifyAccounts().catch(() => [])
  }

  const normalized = normalizeApifyAccountsConfig(raw)
  if (!normalized.length) {
    throw new Error('No valid Apify account configs provided; supply a JSON array via file path or APIFY_ACCOUNTS_JSON')
  }
  return normalized
}

async function main() {
  try {
    const args = process.argv.slice(2)
    const dryRun = args.includes('--dry-run')
    const listMode = args.includes('--list')
    const filteredArgs = args.filter((arg) => arg !== '--dry-run' && arg !== '--list')

    // Patch mode: update actorId in-place in Redis, preserving tokens and other fields.
    // Usage:
    //   npm run manage-apify-accs -- --set-actor effusive_stereo/yt-audio-basic
    // Optional: limit to certain labels
    //   npm run manage-apify-accs -- --set-actor effusive_stereo/yt-audio-basic --labels label1,label2
    const setActorIdx = filteredArgs.findIndex((a) => a === '--set-actor' || a.startsWith('--set-actor='))
    const setActorValue = (() => {
      if (setActorIdx === -1) return undefined
      const arg = filteredArgs[setActorIdx]
      if (arg.includes('=')) return arg.split('=')[1]
      return filteredArgs[setActorIdx + 1]
    })()
    const labelsArg = filteredArgs.find((a) => a.startsWith('--labels='))
    const labels = labelsArg ? labelsArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : undefined

    if (setActorValue) {
      const targetId = setActorValue
      const existing = await loadApifyAccounts(true)
      if (!existing.length) {
        throw new Error('No Apify configs found in Redis; cannot patch. Seed configs first or provide APIFY_ACCOUNTS_JSON.')
      }
      const updated = existing.map((cfg) => {
        if (!labels || labels.includes(cfg.label)) {
          return { ...cfg, actorId: targetId, taskId: undefined }
        }
        return cfg
      })
      if (dryRun) {
        console.log('[manage-apify-accs] Dry run: would update actorId to', targetId, labels ? `for labels: ${labels.join(',')}` : 'for all labels')
        for (const cfg of updated) {
          console.log(' -', cfg.label, { actorId: cfg.actorId || null, taskId: cfg.taskId || null })
        }
        process.exit(0)
      }
      await storeApifyAccounts(updated)
      console.log('[manage-apify-accs] ✓ Updated actorId in Redis to', targetId, labels ? `for labels: ${labels.join(',')}` : '(all labels)')
      console.log('[manage-apify-accs] Labels:', updated.map((c) => c.label).join(', '))
      process.exit(0)
    }

    if (listMode) {
      const configs = await loadApifyAccounts(true)
      if (!configs.length) {
        console.log('[manage-apify-accs] No Apify configs found in Redis (fallback env may still apply).')
        process.exit(0)
      }
      console.log('[manage-apify-accs] Current Apify account configs:')
      for (const cfg of configs) {
        console.log(' -', cfg.label, {
          token: maskSecret(cfg.token),
          actorId: cfg.actorId || null,
          taskId: cfg.taskId || null,
          proxy: cfg.proxyConfiguration ? 'yes' : 'no',
        })
      }
      process.exit(0)
    }

    const configs = await resolveConfigs(filteredArgs)
    if (dryRun) {
      console.log('[manage-apify-accs] Dry run: would write configs:')
      for (const cfg of configs) {
        console.log(' -', cfg.label, {
          token: maskSecret(cfg.token),
          actorId: cfg.actorId || null,
          taskId: cfg.taskId || null,
          proxy: cfg.proxyConfiguration ? 'yes' : 'no',
        })
      }
      process.exit(0)
    }

    await storeApifyAccounts(configs)

    console.log(`[manage-apify-accs] Stored ${configs.length} Apify account${configs.length === 1 ? '' : 's'} in Redis.`)
    console.log('[manage-apify-accs] Labels:', configs.map((cfg) => cfg.label).join(', '))
    process.exit(0)
  } catch (err) {
    console.error('[manage-apify-accs] ✗ Failed:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

void main()
