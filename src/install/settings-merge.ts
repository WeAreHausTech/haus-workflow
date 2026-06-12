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
  /** Haus-private namespace used to track installed hook IDs, commands, and deny/allow/ask rules. */
  _haus?: {
    hooks: string[]
    hookCommands?: string[]
    denyRules?: string[]
    allowRules?: string[]
    askRules?: string[]
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

function collectEventHookCommands(entries: ClaudeHookEntry[]): Set<string> {
  const cmds = new Set<string>()
  for (const entry of entries) {
    for (const h of entry.hooks ?? []) {
      if (h.command) cmds.add(h.command)
    }
  }
  return cmds
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

  const updated = { ...settings }
  updated.hooks = { ...(settings.hooks ?? {}) }

  const addedIds: string[] = []
  const addedCommands: string[] = []

  for (const fragment of fragments) {
    if (fragment.gate !== 'keep') continue

    const event = fragment.event
    const eventEntries = updated.hooks[event] ?? []
    const presentCommands = collectEventHookCommands(eventEntries)
    if (presentCommands.has(fragment.command)) {
      if (!existingCommands.includes(fragment.command)) addedCommands.push(fragment.command)
      continue
    }

    if (!updated.hooks[event]) updated.hooks[event] = []

    const entry: ClaudeHookEntry = {
      hooks: [{ type: 'command', command: fragment.command }],
    }
    if (fragment.matcher) entry.matcher = fragment.matcher

    updated.hooks[event] = [...(updated.hooks[event] ?? []), entry]
    if (!existing.includes(fragment.id)) addedIds.push(fragment.id)
    if (!existingCommands.includes(fragment.command)) addedCommands.push(fragment.command)
  }

  updated._haus = {
    hooks: [...existing, ...addedIds],
    hookCommands: [...existingCommands, ...addedCommands],
    // Preserve deny/allow/ask tracking so hook, deny, allow, and ask merges are order-independent.
    ...(settings._haus?.denyRules ? { denyRules: settings._haus.denyRules } : {}),
    ...(settings._haus?.allowRules ? { allowRules: settings._haus.allowRules } : {}),
    ...(settings._haus?.askRules ? { askRules: settings._haus.askRules } : {}),
  }

  return { settings: updated, addedIds }
}

/**
 * Reconciles the haus-managed slice of a permission array to exactly `newRules`,
 * leaving user-authored rules untouched. Callers always pass the COMPLETE current
 * haus set for the tier (e.g. `buildDenyRules()`), so this both ADDS new haus rules
 * and REMOVES haus rules dropped from / moved out of the build list on update —
 * fixing the additive-only bug where stale rules lingered forever.
 *
 * - `userRules = existing \ prevTracked` — never touched (preserves user rules).
 * - `tracked = newRules \ userRules` — haus claims only rules the user didn't already have,
 *   so uninstall never strips a user's own identical rule.
 * - final array = userRules ++ tracked (user order preserved, then build order).
 *
 * Idempotent: same `newRules` twice yields the same array and tracking.
 */
function reconcileManagedRules(
  existing: string[],
  prevTracked: string[],
  newRules: string[],
): { rules: string[]; tracked: string[]; added: string[]; removed: string[] } {
  const prevTrackedSet = new Set(prevTracked)
  // User rules = existing entries haus never tracked, deduped (first occurrence wins)
  // so accidental duplicates in the source array don't survive reconcile.
  const userRules: string[] = []
  const userSet = new Set<string>()
  for (const rule of existing) {
    if (prevTrackedSet.has(rule) || userSet.has(rule)) continue
    userSet.add(rule)
    userRules.push(rule)
  }

  // Dedupe newRules while excluding any that the user already owns.
  const tracked: string[] = []
  const trackedSet = new Set<string>()
  for (const rule of newRules) {
    if (userSet.has(rule) || trackedSet.has(rule)) continue
    trackedSet.add(rule)
    tracked.push(rule)
  }

  const existingSet = new Set(existing)
  const added = tracked.filter((rule) => !existingSet.has(rule))
  const newSet = new Set([...userSet, ...trackedSet])
  const removed = existing.filter((rule) => !newSet.has(rule))

  return { rules: [...userRules, ...tracked], tracked, added, removed }
}

/**
 * Reconciles haus-managed `permissions.deny` rules to exactly `rules` (the full
 * current haus deny set), preserving user-defined deny rules. Adds new haus rules,
 * removes haus rules no longer shipped, and tracks the result under `_haus.denyRules`
 * for clean uninstall. Idempotent.
 */
export function mergeDenyRules(
  settings: ClaudeSettings,
  rules: string[],
): { settings: ClaudeSettings; addedRules: string[] } {
  const existingDeny = settings.permissions?.deny ?? []
  const trackedDeny = settings._haus?.denyRules ?? []
  const { rules: deny, tracked, added } = reconcileManagedRules(existingDeny, trackedDeny, rules)

  const updated: ClaudeSettings = { ...settings }
  updated.permissions = {
    ...(settings.permissions ?? {}),
    deny,
  }
  updated._haus = {
    hooks: settings._haus?.hooks ?? [],
    ...(settings._haus?.hookCommands ? { hookCommands: settings._haus.hookCommands } : {}),
    denyRules: tracked,
    ...(settings._haus?.allowRules ? { allowRules: settings._haus.allowRules } : {}),
    ...(settings._haus?.askRules ? { askRules: settings._haus.askRules } : {}),
  }

  return { settings: updated, addedRules: added }
}

/**
 * Reconciles haus-managed `permissions.allow` rules to exactly `rules` (the full
 * current haus allow set), preserving user-defined allow rules. Adds new haus rules,
 * removes haus rules no longer shipped, and tracks the result under `_haus.allowRules`
 * for clean uninstall. Idempotent.
 */
export function mergeAllowRules(
  settings: ClaudeSettings,
  rules: string[],
): { settings: ClaudeSettings; addedRules: string[] } {
  const existingAllow = settings.permissions?.allow ?? []
  const trackedAllow = settings._haus?.allowRules ?? []
  const { rules: allow, tracked, added } = reconcileManagedRules(existingAllow, trackedAllow, rules)

  const updated: ClaudeSettings = { ...settings }
  updated.permissions = {
    ...(settings.permissions ?? {}),
    allow,
  }
  updated._haus = {
    hooks: settings._haus?.hooks ?? [],
    ...(settings._haus?.hookCommands ? { hookCommands: settings._haus.hookCommands } : {}),
    ...(settings._haus?.denyRules ? { denyRules: settings._haus.denyRules } : {}),
    allowRules: tracked,
    ...(settings._haus?.askRules ? { askRules: settings._haus.askRules } : {}),
  }

  return { settings: updated, addedRules: added }
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
    (haus.denyRules?.length ?? 0) > 0 ||
    (haus.askRules?.length ?? 0) > 0
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
    (haus.allowRules?.length ?? 0) > 0 ||
    (haus.askRules?.length ?? 0) > 0
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

/**
 * Reconciles haus-managed `permissions.ask` rules to exactly `rules` (the full
 * current haus ask set), preserving user-defined ask rules. Adds new haus rules,
 * removes haus rules no longer shipped, and tracks the result under `_haus.askRules`
 * for clean uninstall. Idempotent.
 */
export function mergeAskRules(
  settings: ClaudeSettings,
  rules: string[],
): { settings: ClaudeSettings; addedRules: string[] } {
  const existingAsk = settings.permissions?.ask ?? []
  const trackedAsk = settings._haus?.askRules ?? []
  const { rules: ask, tracked, added } = reconcileManagedRules(existingAsk, trackedAsk, rules)

  const updated: ClaudeSettings = { ...settings }
  updated.permissions = {
    ...(settings.permissions ?? {}),
    ask,
  }
  updated._haus = {
    hooks: settings._haus?.hooks ?? [],
    ...(settings._haus?.hookCommands ? { hookCommands: settings._haus.hookCommands } : {}),
    ...(settings._haus?.denyRules ? { denyRules: settings._haus.denyRules } : {}),
    ...(settings._haus?.allowRules ? { allowRules: settings._haus.allowRules } : {}),
    askRules: tracked,
  }

  return { settings: updated, addedRules: added }
}

/**
 * Returns a copy of settings with haus-installed ask rules removed (identified
 * by `_haus.askRules`), leaving user-defined ask rules intact. Cleans up empty
 * `permissions`/`ask` containers and drops the `_haus` namespace if nothing else
 * is tracked there.
 */
export function stripHausAsk(settings: ClaudeSettings): ClaudeSettings {
  const prevHaus = settings._haus
  if (!prevHaus?.askRules || prevHaus.askRules.length === 0) return settings

  const ownedSet = new Set(prevHaus.askRules)
  const updated: ClaudeSettings = { ...settings }

  const remainingAsk = (settings.permissions?.ask ?? []).filter((rule) => !ownedSet.has(rule))
  const permissions: ClaudePermissions = { ...(settings.permissions ?? {}) }
  if (remainingAsk.length > 0) permissions.ask = remainingAsk
  else delete permissions.ask
  if (Object.keys(permissions).length > 0) updated.permissions = permissions
  else delete updated.permissions

  const haus = { ...prevHaus }
  delete haus.askRules
  const stillTracking =
    (haus.hooks?.length ?? 0) > 0 ||
    (haus.hookCommands?.length ?? 0) > 0 ||
    (haus.denyRules?.length ?? 0) > 0 ||
    (haus.allowRules?.length ?? 0) > 0
  if (stillTracking) updated._haus = haus
  else delete updated._haus

  return updated
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
