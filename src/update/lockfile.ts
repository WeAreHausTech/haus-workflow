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

/** Result of validating a project lockfile. */
export type LockCheckResult = {
  ok: boolean
  count: number
  catalogRef: string | null
  /** Lock items whose on-disk content no longer matches the stored hash. */
  drift: Array<{ id: string; expected: string; actual: string }>
  driftCount: number
}

/** Cheap lockfile facts that don't require hashing any installed file content. */
export type LockSummary = { count: number; catalogRef: string | null }

/**
 * Reads just the lockfile's item count and catalog ref — no per-item content hashing
 * (unlike `checkLock`). Use this where only "is this project set up, and from which
 * catalog ref" is needed (e.g. a SessionStart hook run on every session) — hashing every
 * tracked file's content on each check is needless latency when nothing else is at play.
 */
export async function readLockSummary(root: string): Promise<LockSummary> {
  const lock = (await readJson<LockItem[]>(hausPath(root, 'haus.lock.json'))) ?? []
  return { count: lock.length, catalogRef: lock[0]?.catalogRef ?? null }
}

/** Validates the lockfile and compares stored hashes to installed file content. */
export async function checkLock(root: string): Promise<LockCheckResult> {
  const lock = (await readJson<LockItem[]>(hausPath(root, 'haus.lock.json'))) ?? []
  const hasValidVersions = lock.every(
    (item) => !item.version || normalizeVersion(item.version) !== null,
  )
  const catalogRef = lock[0]?.catalogRef ?? null

  const drift: LockCheckResult['drift'] = []
  for (const item of lock) {
    if (!item.hash) continue
    const paths = Array.isArray(item.paths) ? item.paths.map(String) : []
    const actual = await hashInstalledPaths(root, paths)
    if (item.hash !== actual) {
      drift.push({ id: item.id, expected: item.hash, actual })
    }
  }

  const ok = lock.length > 0 && hasValidVersions && drift.length === 0
  return { ok, count: lock.length, catalogRef, drift, driftCount: drift.length }
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
