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
import { readJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { claudePath, hausPath } from '../utils/paths.js'
import { confirm } from '../utils/prompts.js'

type LockRow = { paths?: string[] }

/** Collects absolute paths haus may remove: lock entries plus core managed files. */
async function collectManagedPaths(root: string): Promise<string[]> {
  const paths = new Set(coreManagedAbsolutePaths(root))
  const lock = await readJson<LockRow[]>(hausPath(root, 'haus.lock.json'))
  for (const row of lock ?? []) {
    for (const rel of row.paths ?? []) {
      paths.add(path.resolve(root, rel))
    }
  }
  const existing: string[] = []
  for (const abs of paths) {
    if (await fs.pathExists(abs)) existing.push(abs)
  }
  return existing
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
  settings = stripHausAsk(stripHausAllow(stripHausDeny(stripHausHooks(settings))))
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
  const entries = await fs.readdir(dir)
  if (entries.length === 0) await fs.remove(dir)
}

/**
 * Removes haus-managed files from the project: lock-tracked catalog paths, core
 * managed rules/commands, haus workflow artifacts, and haus portions of settings.json.
 * User-added `.claude/` files and editable `.haus-workflow/` docs are preserved.
 */
export async function runUndo(options: { yes?: boolean }): Promise<void> {
  const root = process.cwd()
  const managed = await collectManagedPaths(root)
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

  if (!options.yes) {
    const ok = await confirm(
      `Remove haus-managed files?\n  ${summaryParts.join('\n  ')}\nUser-owned .claude/ files will be preserved.`,
    )
    if (!ok) {
      log('Cancelled.')
      return
    }
  }

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
