/**
 * Reads and writes .haus-workflow/haus.lock.json, which tracks the installed catalog
 * items, their versions, paths, and content hashes.
 */
import { mkdir, readFile, copyFile } from 'node:fs/promises'
import path from 'node:path'

import { createUnifiedDiff, hasTextChanged } from '../utils/diff.js'
import { readJson, writeJson } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'
import { normalizeVersion } from '../utils/versions.js'

import { hashInstalledPaths } from './hash-installed.js'

/** A single entry in the haus lockfile representing an installed catalog item. */
export type LockItem = {
  id: string
  type: string
  source?: string
  version?: string
  /** Git ref (tag or branch) the catalog was fetched from when this item was installed. */
  catalogRef?: string
  hash?: string
  installMode?: string
  paths?: string[]
  // Curated provenance — populated for source:"curated" items
  originSourceId?: string
  useMode?: string
  license?: string
  riskLevel?: string
  reviewStatus?: string
}

/** Validates the lockfile and returns item count and the catalogRef used at install time. */
export async function checkLock(
  root: string,
): Promise<{ ok: boolean; count: number; catalogRef: string | null }> {
  const lock = (await readJson<LockItem[]>(hausPath(root, 'haus.lock.json'))) ?? []
  const hasValidVersions = lock.every(
    (item) => !item.version || normalizeVersion(item.version) !== null,
  )
  // All items in a lock file share the same catalogRef (set at install time).
  const catalogRef = lock[0]?.catalogRef ?? null
  return { ok: lock.length > 0 && hasValidVersions, count: lock.length, catalogRef }
}

/**
 * Re-hashes all installed paths for every lock item, writes the updated lockfile,
 * and creates a timestamped backup of the previous one.
 */
export async function applyLock(root: string): Promise<{ before: string; after: string }> {
  const lockPath = hausPath(root, 'haus.lock.json')
  let before = '[]'
  try {
    before = await readFile(lockPath, 'utf8')
  } catch {
    before = '[]'
  }
  const lock = (await readJson<LockItem[]>(lockPath)) ?? []
  try {
    const backupDir = hausPath(root, 'backups')
    await mkdir(backupDir, { recursive: true })
    await copyFile(lockPath, path.join(backupDir, `haus.lock.${Date.now()}.json`))
  } catch {
    // no previous lockfile to backup
  }
  const enriched = await Promise.all(
    lock.map(async (x) => {
      const paths = Array.isArray(x.paths) ? x.paths.map(String) : []
      const { hash: _oldHash, ...stableFields } = x
      const newHash = await hashInstalledPaths(root, paths)
      return { ...stableFields, paths, hash: newHash }
    }),
  )
  await writeJson(lockPath, enriched)
  const after = `${JSON.stringify(enriched, null, 2)}\n`
  return { before, after }
}

/** Returns a unified diff of the lockfile before and after an apply, or a "no changes" message. */
export function diffLock(before: string, after: string): string {
  if (!hasTextChanged(before, after)) return 'No lockfile changes.'
  return createUnifiedDiff('.haus-workflow/haus.lock.json', before, after)
}

/** Returns true when a project-level .claude/settings.json exists, indicating local overrides. */
export async function hasLocalOverrides(root: string): Promise<boolean> {
  try {
    await readFile(path.join(root, '.claude', 'settings.json'), 'utf8')
    return true
  } catch {
    return false
  }
}
