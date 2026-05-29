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

/** Subset of ~/.claude/settings.json that haus reads and writes. */
type ClaudeSettings = {
  hooks?: Record<string, ClaudeHookEntry[]>
  /** Haus-private namespace used to track installed hook IDs and commands. */
  _haus?: {
    hooks: string[]
    hookCommands?: string[]
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
  }

  return { settings: updated, addedIds }
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
