/**
 * Merges haus hook fragments into ~/.claude/settings.json without clobbering
 * user-owned hook entries, and strips them back out on uninstall.
 */
import path from 'node:path'

import fs from 'fs-extra'

import { readJson, writeJson } from '../utils/fs.js'

import { globalClaudeDir } from './manifest.js'

/** A single hook entry from the bundled hooks.json fragment file. */
export interface HookFragment {
  /** Unique identifier used to track which hooks haus has installed. */
  id: string
  /** "keep" means always install; "gate-default-off" means skip unless opted in. */
  gate: 'keep' | 'gate-default-off'
  /** Claude Code hook lifecycle event (e.g. "PostToolUse"). */
  event: string
  matcher?: string
  command: string
}

/** Schema of the bundled library/global/settings-fragments/hooks.json file. */
export interface HooksFragmentFile {
  _schema: string
  hooks: HookFragment[]
}

/** Shape of a single entry in settings.json's hook event arrays. */
type ClaudeHookEntry = {
  matcher?: string
  hooks: Array<{ type: string; command: string }>
}

/** Claude Code `permissions` block (deny/ask/allow rule-string arrays). */
type ClaudePermissions = {
  deny?: string[]
  allow?: string[]
  ask?: string[]
}

/** Subset of Claude Code settings.json that haus reads and writes. */
export type ClaudeSettings = {
  hooks?: Record<string, ClaudeHookEntry[]>
  permissions?: ClaudePermissions
  /** Haus-private namespace used to track installed hook IDs, commands, and deny/allow rules. */
  _haus?: {
    hooks: string[]
    hookCommands?: string[]
    denyRules?: string[]
    allowRules?: string[]
  }
  [key: string]: unknown
}

/** Returns the absolute path to ~/.claude/settings.json. */
export function settingsJsonPath(): string {
  return path.join(globalClaudeDir(), 'settings.json')
}

/** Reads ~/.claude/settings.json, returning an empty object if missing. */
export async function readSettings(): Promise<ClaudeSettings> {
  const parsed = await readJson<ClaudeSettings>(settingsJsonPath())
  return parsed ?? {}
}

/** Writes the given settings object to ~/.claude/settings.json. */
export async function writeSettings(settings: ClaudeSettings): Promise<void> {
  await writeJson(settingsJsonPath(), settings)
}

/**
 * Adds hook fragments with gate="keep" to the settings object, skipping any
 * already registered by a previous install. Returns the updated settings and the
 * IDs that were newly added.
 */
export function mergeHooks(
  settings: ClaudeSettings,
  fragments: HookFragment[],
): { settings: ClaudeSettings; addedIds: string[] } {
  const existing = settings._haus?.hooks ?? []
  const existingCommands = settings._haus?.hookCommands ?? []
  const existingSet = new Set(existing)

  const updated = { ...settings }
  updated.hooks = { ...(settings.hooks ?? {}) }

  const addedIds: string[] = []
  const addedCommands: string[] = []

  for (const fragment of fragments) {
    if (fragment.gate !== 'keep') continue
    if (existingSet.has(fragment.id)) continue

    const event = fragment.event
    if (!updated.hooks[event]) updated.hooks[event] = []

    const entry: ClaudeHookEntry = {
      hooks: [{ type: 'command', command: fragment.command }],
    }
    if (fragment.matcher) entry.matcher = fragment.matcher

    updated.hooks[event] = [...(updated.hooks[event] ?? []), entry]
    addedIds.push(fragment.id)
    addedCommands.push(fragment.command)
  }

  updated._haus = {
    hooks: [...existing, ...addedIds],
    hookCommands: [...existingCommands, ...addedCommands],
    // Preserve deny/allow tracking so hook, deny, and allow merges are order-independent.
    ...(settings._haus?.denyRules ? { denyRules: settings._haus.denyRules } : {}),
    ...(settings._haus?.allowRules ? { allowRules: settings._haus.allowRules } : {}),
  }

  return { settings: updated, addedIds }
}

/**
 * Adds `permissions.deny` rule strings to the settings object, skipping any
 * already present (whether user-defined or haus-installed). Tracks only the
 * newly-added rules under `_haus.denyRules` so they can be cleanly stripped on
 * uninstall without touching the user's own deny rules. Idempotent.
 */
export function mergeDenyRules(
  settings: ClaudeSettings,
  rules: string[],
): { settings: ClaudeSettings; addedRules: string[] } {
  const existingDeny = settings.permissions?.deny ?? []
  const seen = new Set(existingDeny)
  const trackedDeny = settings._haus?.denyRules ?? []

  const addedRules: string[] = []
  for (const rule of rules) {
    if (seen.has(rule)) continue
    seen.add(rule)
    addedRules.push(rule)
  }

  const updated: ClaudeSettings = { ...settings }
  updated.permissions = {
    ...(settings.permissions ?? {}),
    deny: [...existingDeny, ...addedRules],
  }
  updated._haus = {
    hooks: settings._haus?.hooks ?? [],
    ...(settings._haus?.hookCommands ? { hookCommands: settings._haus.hookCommands } : {}),
    denyRules: [...trackedDeny, ...addedRules],
    ...(settings._haus?.allowRules ? { allowRules: settings._haus.allowRules } : {}),
  }

  return { settings: updated, addedRules }
}

/**
 * Adds `permissions.allow` rule strings to the settings object, skipping any
 * already present (whether user-defined or haus-installed). Tracks only the
 * newly-added rules under `_haus.allowRules` so they can be cleanly stripped on
 * uninstall without touching the user's own allow rules. Idempotent.
 */
export function mergeAllowRules(
  settings: ClaudeSettings,
  rules: string[],
): { settings: ClaudeSettings; addedRules: string[] } {
  const existingAllow = settings.permissions?.allow ?? []
  const seen = new Set(existingAllow)
  const trackedAllow = settings._haus?.allowRules ?? []

  const addedRules: string[] = []
  for (const rule of rules) {
    if (seen.has(rule)) continue
    seen.add(rule)
    addedRules.push(rule)
  }

  const updated: ClaudeSettings = { ...settings }
  updated.permissions = {
    ...(settings.permissions ?? {}),
    allow: [...existingAllow, ...addedRules],
  }
  updated._haus = {
    hooks: settings._haus?.hooks ?? [],
    ...(settings._haus?.hookCommands ? { hookCommands: settings._haus.hookCommands } : {}),
    ...(settings._haus?.denyRules ? { denyRules: settings._haus.denyRules } : {}),
    allowRules: [...trackedAllow, ...addedRules],
  }

  return { settings: updated, addedRules }
}

/**
 * Returns a copy of settings with haus-installed allow rules removed (identified
 * by `_haus.allowRules`), leaving user-defined allow rules intact. Cleans up empty
 * `permissions`/`allow` containers and drops the `_haus` namespace if nothing else
 * is tracked there.
 */
export function stripHausAllow(settings: ClaudeSettings): ClaudeSettings {
  const prevHaus = settings._haus
  if (!prevHaus?.allowRules || prevHaus.allowRules.length === 0) return settings

  const ownedSet = new Set(prevHaus.allowRules)
  const updated: ClaudeSettings = { ...settings }

  const remainingAllow = (settings.permissions?.allow ?? []).filter((rule) => !ownedSet.has(rule))
  const permissions: ClaudePermissions = { ...(settings.permissions ?? {}) }
  if (remainingAllow.length > 0) permissions.allow = remainingAllow
  else delete permissions.allow
  if (Object.keys(permissions).length > 0) updated.permissions = permissions
  else delete updated.permissions

  const haus = { ...prevHaus }
  delete haus.allowRules
  const stillTracking =
    (haus.hooks?.length ?? 0) > 0 ||
    (haus.hookCommands?.length ?? 0) > 0 ||
    (haus.denyRules?.length ?? 0) > 0
  if (stillTracking) updated._haus = haus
  else delete updated._haus

  return updated
}

/**
 * Returns a copy of settings with haus-installed deny rules removed (identified
 * by `_haus.denyRules`), leaving user-defined deny rules intact. Cleans up empty
 * `permissions`/`deny` containers and drops the `_haus` namespace if nothing else
 * is tracked there.
 */
export function stripHausDeny(settings: ClaudeSettings): ClaudeSettings {
  const prevHaus = settings._haus
  if (!prevHaus?.denyRules || prevHaus.denyRules.length === 0) return settings

  const ownedSet = new Set(prevHaus.denyRules)
  const updated: ClaudeSettings = { ...settings }

  const remainingDeny = (settings.permissions?.deny ?? []).filter((rule) => !ownedSet.has(rule))
  const permissions: ClaudePermissions = { ...(settings.permissions ?? {}) }
  if (remainingDeny.length > 0) permissions.deny = remainingDeny
  else delete permissions.deny
  if (Object.keys(permissions).length > 0) updated.permissions = permissions
  else delete updated.permissions

  const haus = { ...prevHaus }
  delete haus.denyRules
  const stillTracking =
    (haus.hooks?.length ?? 0) > 0 ||
    (haus.hookCommands?.length ?? 0) > 0 ||
    (haus.allowRules?.length ?? 0) > 0
  if (stillTracking) updated._haus = haus
  else delete updated._haus

  return updated
}

/**
 * Returns a copy of settings with all haus-installed hook entries removed,
 * identified by the recorded command list in `_haus.hookCommands` (or a prefix
 * fallback for older installs), and the `_haus` namespace key itself deleted.
 */
export function stripHausHooks(settings: ClaudeSettings): ClaudeSettings {
  // No _haus block at all — nothing installed by haus, true no-op.
  if (!settings._haus) return settings

  const ownedCommands = new Set(settings._haus.hookCommands ?? [])
  // Fall back to prefix match for old installs that predate hookCommands recording.
  const usePrefix = ownedCommands.size === 0

  const updated = { ...settings }
  updated.hooks = {}

  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    const kept = (entries as ClaudeHookEntry[]).filter((entry) => {
      const cmd = entry.hooks[0]?.command ?? ''
      return usePrefix ? !cmd.startsWith('haus ') : !ownedCommands.has(cmd)
    })
    if (kept.length > 0) updated.hooks[event] = kept
  }

  const { _haus: _, ...rest } = updated
  void _
  return rest
}

/** Reads and parses the bundled hooks.json fragment file; returns [] if missing or invalid. */
export async function loadHooksFragment(fragmentPath: string): Promise<HookFragment[]> {
  let raw: unknown
  try {
    raw = await fs.readJson(fragmentPath)
  } catch {
    return []
  }
  const data = raw as HooksFragmentFile
  return Array.isArray(data?.hooks) ? data.hooks : []
}
