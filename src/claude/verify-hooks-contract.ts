import fs from 'fs-extra'

import type { ClaudeSettings } from '../install/settings-merge.js'
import { readJson } from '../utils/fs.js'
import { claudePath } from '../utils/paths.js'

import type { ClaudeHooksSettings } from './load-hooks.js'
import { loadClaudeHooksSettings } from './load-hooks.js'

function collectHookCommands(settings: {
  hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>>
}): string[] {
  const cmds: string[] = []
  for (const entries of Object.values(settings.hooks ?? {})) {
    for (const entry of entries) {
      for (const h of entry.hooks ?? []) {
        if (h.command) cmds.push(h.command)
      }
    }
  }
  return cmds
}

/**
 * True when every canonical haus hook command and deny rule is present in `project`.
 * Extra user hooks, permissions, or top-level keys are allowed.
 */
export function hausHookContractSatisfied(
  project: ClaudeSettings,
  canonical: ClaudeHooksSettings,
): boolean {
  const present = new Set(collectHookCommands(project))
  for (const block of canonical.hooks.UserPromptSubmit) {
    for (const h of block.hooks) {
      if (!present.has(h.command)) return false
    }
  }
  for (const block of canonical.hooks.PreToolUse) {
    for (const h of block.hooks) {
      if (!present.has(h.command)) return false
    }
  }
  const denySet = new Set(project.permissions?.deny ?? [])
  for (const rule of canonical.permissions?.deny ?? []) {
    if (!denySet.has(rule)) return false
  }
  return true
}

/** After `apply --write`, ensure disk carries the haus hook/deny contract (merge-safe). */
export async function assertPostApplySettingsHausContract(root: string): Promise<void> {
  const canonical = await loadClaudeHooksSettings()
  const written = await readJson<ClaudeSettings>(claudePath(root, 'settings.json'))
  if (written == null || typeof written !== 'object') {
    throw new Error(
      'haus: post-apply self-check failed: .claude/settings.json missing or unreadable',
    )
  }
  if (!hausHookContractSatisfied(written, canonical)) {
    throw new Error(
      'haus: post-apply self-check failed: .claude/settings.json missing required haus hooks or deny rules',
    )
  }
}

export type HooksDoctorResult = { ok: boolean; skipped?: boolean; message: string }

/**
 * Compare project `.claude/settings.json` to the canonical haus hook contract.
 * User-owned extras do not fail the check.
 */
export async function verifyProjectSettingsHooksContract(root: string): Promise<HooksDoctorResult> {
  const settingsPath = claudePath(root, 'settings.json')
  if (!(await fs.pathExists(settingsPath))) {
    return {
      ok: true,
      skipped: true,
      message: 'No .claude/settings.json (run `haus apply --write` to install hooks).',
    }
  }
  let canonical: ClaudeHooksSettings
  try {
    canonical = await loadClaudeHooksSettings()
  } catch (err) {
    return { ok: false, message: `Cannot load canonical hooks: ${String(err)}` }
  }
  const project = await readJson<ClaudeSettings>(settingsPath)
  if (project == null || typeof project !== 'object') {
    return { ok: false, message: '.claude/settings.json is unreadable.' }
  }
  if (!hausHookContractSatisfied(project, canonical)) {
    return {
      ok: false,
      message:
        '.claude/settings.json missing required haus hooks or deny rules (regenerate with `haus apply --write`).',
    }
  }
  return { ok: true, message: 'settings.json carries required haus hook contract.' }
}
