/** `haus undo` — removes haus-managed project files; preserves user-owned `.claude/` content. */
import path from 'node:path'

import fs from 'fs-extra'

import { coreManagedAbsolutePaths } from '../claude/managed-paths.js'
import { readProjectSettings, writeProjectSettings } from '../claude/merge-project-settings.js'
import { BLOCK_BEGIN, stripHausBlock } from '../claude/write-root-claude-md.js'
import {
  stripHausAllow,
  stripHausAsk,
  stripHausDeny,
  stripHausHooks,
} from '../install/settings-merge.js'
import { hashInstalledPaths } from '../update/hash-installed.js'
import { readJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { claudePath, hausPath } from '../utils/paths.js'
import { confirm } from '../utils/prompts.js'

type LockRow = { id?: string; paths?: string[]; hash?: string }

/** Absolute paths of core managed files — always safe to remove, no per-file hash to check. */
async function collectCoreManagedPaths(root: string): Promise<string[]> {
  const existing: string[] = []
  for (const abs of coreManagedAbsolutePaths(root)) {
    if (await fs.pathExists(abs)) existing.push(abs)
  }
  return existing
}

/**
 * Lock-tracked catalog item paths, split into those safe to remove (content still
 * matches the recorded hash) and those to leave in place (user-modified since install),
 * mirroring the hash-gated contract `cleanupStaleCatalogItems` already applies on apply.
 */
async function collectLockTrackedPaths(
  root: string,
): Promise<{ removable: string[]; preserved: string[] }> {
  const lock = await readJson<LockRow[]>(hausPath(root, 'haus.lock.json'))
  const removable: string[] = []
  const preserved: string[] = []
  for (const row of lock ?? []) {
    const relPaths = row.paths ?? []
    const existingRel: string[] = []
    for (const rel of relPaths) {
      if (await fs.pathExists(path.resolve(root, rel))) existingRel.push(rel)
    }
    if (existingRel.length === 0) continue
    if (row.hash === undefined) {
      // No recorded hash to verify against — treat as removable (matches historical
      // behavior for entries predating hash tracking; there is nothing to compare).
      removable.push(...existingRel.map((rel) => path.resolve(root, rel)))
      continue
    }
    const currentHash = await hashInstalledPaths(root, relPaths)
    if (currentHash === row.hash) {
      removable.push(...existingRel.map((rel) => path.resolve(root, rel)))
    } else {
      preserved.push(...existingRel.map((rel) => path.resolve(root, rel)))
      log(`Preserving locally-modified ${row.id ?? '(unknown item)'}: ${existingRel.join(', ')}`)
    }
  }
  return { removable, preserved }
}

async function settingsHasHausContent(root: string): Promise<boolean> {
  const settingsPath = claudePath(root, 'settings.json')
  if (!(await fs.pathExists(settingsPath))) return false
  const settings = await readProjectSettings(root)
  return settings._haus != null
}

async function claudeMdHasHausBlock(root: string): Promise<boolean> {
  const filePath = path.join(root, 'CLAUDE.md')
  if (!(await fs.pathExists(filePath))) return false
  const text = await fs.readFile(filePath, 'utf8')
  return text.includes(BLOCK_BEGIN)
}

/** Strips haus hooks/deny/allow from project settings.json; removes file when empty. */
async function stripProjectSettings(root: string): Promise<boolean> {
  const settingsPath = claudePath(root, 'settings.json')
  if (!(await fs.pathExists(settingsPath))) return false

  let settings = await readProjectSettings(root)
  // Strip deny + allow + ask rules first (each keeps _haus while other tracking remains),
  // then hooks last (deletes the _haus namespace). stripHausHooks must run last: it removes
  // _haus wholesale, so any rule-strip after it would see no ledger and silently no-op,
  // orphaning haus rules in the user's settings.json. Mirrors uninstall.ts.
  settings = stripHausHooks(stripHausAsk(stripHausAllow(stripHausDeny(settings))))
  const hasContent = Object.keys(settings).length > 0
  if (hasContent) {
    await writeProjectSettings(root, settings)
    log(`Stripped haus rules from ${path.relative(root, settingsPath)} (user settings preserved).`)
    return true
  }
  await fs.remove(settingsPath)
  log(`Removed ${path.relative(root, settingsPath)} (no user-owned settings remained).`)
  return true
}

/** Removes the haus import block from root CLAUDE.md when present. */
async function stripRootClaudeMd(root: string): Promise<boolean> {
  const filePath = path.join(root, 'CLAUDE.md')
  if (!(await fs.pathExists(filePath))) return false
  const prev = await fs.readFile(filePath, 'utf8')
  if (!prev.includes(BLOCK_BEGIN)) return false
  const next = stripHausBlock(prev)
  if (next.length === 0) {
    await fs.remove(filePath)
    log('Removed CLAUDE.md (only contained haus import block).')
  } else {
    await fs.writeFile(filePath, next, 'utf8')
    log('Removed haus import block from CLAUDE.md (user content preserved).')
  }
  return true
}

async function pruneDirIfEmpty(dir: string): Promise<void> {
  if (!(await fs.pathExists(dir))) return
  try {
    const entries = await fs.readdir(dir)
    if (entries.length === 0) await fs.remove(dir)
  } catch {
    // Leave directory in place if unreadable
  }
}

async function backupManagedFilesBeforeUndo(
  root: string,
  managedAbsPaths: string[],
): Promise<void> {
  if (managedAbsPaths.length === 0) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupRoot = hausPath(root, 'backups', `undo-${stamp}`)
  for (const abs of managedAbsPaths) {
    if (!(await fs.pathExists(abs))) continue
    const rel = path.relative(root, abs)
    const backupPath = path.join(backupRoot, rel)
    await fs.ensureDir(path.dirname(backupPath))
    await fs.copy(abs, backupPath)
  }
  log(`Backed up ${managedAbsPaths.length} managed file(s) to ${path.relative(root, backupRoot)}.`)
}

/**
 * Removes haus-managed files from the project: lock-tracked catalog paths, core
 * managed rules/commands, haus workflow artifacts, and haus portions of settings.json.
 * User-added `.claude/` files and editable `.haus-workflow/` docs are preserved.
 */
export async function runUndo(options: { yes?: boolean }): Promise<void> {
  const root = process.cwd()
  const coreManaged = await collectCoreManagedPaths(root)
  const { removable: lockRemovable, preserved: lockPreserved } = await collectLockTrackedPaths(root)
  const managed = [...new Set([...coreManaged, ...lockRemovable])]
  const stripSettings = await settingsHasHausContent(root)
  const stripClaudeMd = await claudeMdHasHausBlock(root)

  if (managed.length === 0 && !stripSettings && !stripClaudeMd) {
    log('Nothing to remove: no haus-managed files found in this directory.')
    return
  }

  const relTargets = managed.map((p) => path.relative(root, p))
  const summaryParts = [...relTargets]
  if (stripSettings) summaryParts.push('.claude/settings.json (haus rules only)')
  if (stripClaudeMd) summaryParts.push('CLAUDE.md (haus import block only)')
  if (lockPreserved.length > 0) {
    summaryParts.push(
      `(preserving ${lockPreserved.length} locally-modified catalog item file(s) — not shown above)`,
    )
  }

  if (!options.yes) {
    const ok = await confirm(
      `Remove haus-managed files?\n  ${summaryParts.join('\n  ')}\nUser-owned .claude/ files will be preserved.`,
    )
    if (!ok) {
      log('Cancelled.')
      return
    }
  }

  await backupManagedFilesBeforeUndo(root, managed)

  for (const abs of managed) {
    if (!(await fs.pathExists(abs))) continue
    await fs.remove(abs)
    log(`Removed ${path.relative(root, abs)}`)
  }

  if (stripSettings) await stripProjectSettings(root)
  if (stripClaudeMd) await stripRootClaudeMd(root)

  await pruneDirIfEmpty(claudePath(root))
  await pruneDirIfEmpty(hausPath(root))

  log('haus undo complete. Scan artifacts under .haus-workflow/ were left in place.')
}
