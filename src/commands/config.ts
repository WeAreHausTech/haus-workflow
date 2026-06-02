/** `haus config` — enables, disables, or shows the status of a hook setting in .haus-workflow/config.json. */
import path from 'node:path'

import {
  DEFAULT_HOOKS_CONFIG,
  type HookKey,
  type HooksConfig,
} from '../claude/load-hooks-config.js'
import { readJson, writeJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'

const CONFIG_PATH = '.haus-workflow/config.json'

const HOOK_ALIASES: Record<string, HookKey> = {
  'hook.context': 'context',
}

/**
 * Enables, disables, or prints the status of a hook configuration key.
 * Persists changes to `.haus-workflow/config.json`.
 */
export async function runConfig(
  key: string,
  action: 'enable' | 'disable' | 'status',
): Promise<void> {
  const hookKey = HOOK_ALIASES[key]
  if (!hookKey) {
    throw new Error(
      `Unknown config key "${key}". Valid keys: ${Object.keys(HOOK_ALIASES).join(', ')}`,
    )
  }

  const root = process.cwd()
  const configPath = path.join(root, CONFIG_PATH)
  const existing = await readJson<HooksConfig>(configPath)
  const cfg: HooksConfig = existing ?? structuredClone(DEFAULT_HOOKS_CONFIG)
  cfg.hooks ??= {}
  cfg.hooks[hookKey] ??= {}

  if (action === 'status') {
    const enabled = cfg.hooks[hookKey]?.enabled === true
    log(`${key}: ${enabled ? 'enabled' : 'disabled'}`)
    return
  }

  cfg.hooks[hookKey]!.enabled = action === 'enable'
  await writeJson(configPath, cfg)
  log(`${key} ${action}d`)
}
