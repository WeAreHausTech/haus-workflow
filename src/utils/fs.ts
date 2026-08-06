/** Async file I/O helpers used throughout src/ — thin wrappers over fs-extra and fast-glob. */

import crypto from 'node:crypto'
import path from 'node:path'

import fg from 'fast-glob'
import fs from 'fs-extra'

/** Parse a JSON file, returning `undefined` instead of throwing on missing or malformed files. */
export type ReadJsonDetailedResult<T> =
  { status: 'ok'; value: T } | { status: 'missing' } | { status: 'invalid'; error: unknown }

/** Thrown when a JSON settings file exists but cannot be parsed; merge/write is refused. */
export class MalformedJsonFileError extends Error {
  readonly name = 'MalformedJsonFileError'

  constructor(
    readonly filePath: string,
    readonly backupPath: string,
  ) {
    super(`Refusing to modify ${filePath}: invalid JSON. Backup written to ${backupPath}`)
  }
}

/** Parse JSON with ENOENT vs parse-error distinction. */
export async function readJsonDetailed<T>(file: string): Promise<ReadJsonDetailedResult<T>> {
  try {
    if (!(await fs.pathExists(file))) return { status: 'missing' }
    const raw = await fs.readFile(file, 'utf8')
    try {
      return { status: 'ok', value: JSON.parse(raw) as T }
    } catch (error) {
      return { status: 'invalid', error }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' }
    throw error
  }
}

/** Copy a malformed JSON file beside the original before refusing to overwrite it. */
export async function backupMalformedJsonFile(file: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${file}.haus-malformed-${stamp}.bak`
  await fs.copy(file, backupPath)
  return backupPath
}

export async function readJson<T>(file: string): Promise<T | undefined> {
  const result = await readJsonDetailed<T>(file)
  if (result.status === 'ok') return result.value
  return undefined
}

/** Write `value` as pretty-printed JSON, creating parent directories as needed. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await atomicWriteText(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** Removes `dir` when it is empty, to avoid leaving ghost directories after deleting files. */
export async function pruneEmptyDir(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir)
    if (entries.length === 0) await fs.remove(dir)
  } catch {
    /* ignore */
  }
}

/** Read a text file, returning `undefined` instead of throwing on missing files. */
export async function readText(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return undefined
  }
}

/** Write a text file, creating parent directories as needed. */
export async function writeText(file: string, value: string): Promise<void> {
  await atomicWriteText(file, value)
}

async function atomicWriteText(file: string, value: string): Promise<void> {
  const dir = path.dirname(file)
  await fs.ensureDir(dir)
  const tempPath = path.join(
    dir,
    `.tmp-haus-write-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await fs.writeFile(tempPath, value, 'utf8')
  await fs.move(tempPath, file, { overwrite: true })
}

export async function exists(file: string): Promise<boolean> {
  return fs.pathExists(file)
}

/**
 * Finds subdirectories that contain their own `.git` entry (file or directory —
 * linked worktrees use a `.git` *file*, normal checkouts a directory), at any depth
 * below `root`, excluding `root`'s own `.git`. Each match marks the root of a
 * nested/sibling repo. A repo nested inside another nested repo collapses into the
 * shallower one (matching "don't descend past a match" — everything below the first
 * match belongs to that other repo, not a repo of its own).
 *
 * Uses a single `fast-glob` pass (not a manual recursive `readdir` walk) so this stays
 * cheap on large trees — `**\/.git/**` is excluded from traversal, so the search never
 * descends into a repo's own object store, only ever matches the `.git` entry itself.
 * `fast-glob`'s directory entries are never resolved through symlinks by default, so a
 * symlink cannot be used to route the search outside `root` — consistent with this
 * codebase's no-symlink-follow posture (ADR-0019, ADR-0021; ADR-0010 is unrelated
 * supply-chain hardening).
 *
 * @param root - Absolute scan root.
 * @returns Relative (POSIX-style) paths of directories that are nested repo roots.
 */
async function findNestedRepoDirs(root: string): Promise<string[]> {
  // NOTE: deliberately no `**/.git/**` ignore entry here — empirically that pattern
  // also excludes the bare `.git` match itself (fast-glob/micromatch treats
  // `dir` and `dir/**` as overlapping for ignore purposes), which would silently
  // break detection entirely. fast-glob already short-circuits its own descent once
  // a `**/.git` match is found (verified: ~15ms against this repo's own sizeable
  // `.git`, no full walk of `.git/objects`), so no extra ignore is needed for that.
  const matches = await fg('**/.git', {
    cwd: root,
    dot: true,
    onlyFiles: false,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
  })

  const owners = new Set<string>()
  for (const match of matches) {
    const owner = path.posix.dirname(match)
    if (owner === '.' || owner === '') continue // root's own .git doesn't count.
    owners.add(owner)
  }

  // Collapse a repo nested inside another nested repo into the shallower match.
  const shallowestFirst = [...owners].sort((a, b) => a.split('/').length - b.split('/').length)
  const nested: string[] = []
  for (const dir of shallowestFirst) {
    if (nested.some((kept) => dir === kept || dir.startsWith(`${kept}/`))) continue
    nested.push(dir)
  }
  return nested
}

/**
 * Glob for files matching `patterns` under `root`, excluding node_modules, .git, dist,
 * test fixtures, and any subtree that is itself the root of a nested/sibling repo (its
 * own `.git`, file or directory). tests/fixtures/** holds sample repos used by the
 * scanner's own test suite (e.g. a fake .csproj or vendure-config.ts) — without this
 * exclusion, unanchored SAFE_FILES globs match them as if they were real project
 * signals. The nested-repo exclusion prevents the same failure mode for a *real*
 * sibling repo living under the scan root (e.g. a meta-repo containing an independent
 * checkout one level down) — its files must never leak into the parent scan.
 * Results are sorted for stable ordering across platforms.
 */
export async function listFiles(root: string, patterns: string[]): Promise<string[]> {
  const nestedRepoDirs = await findNestedRepoDirs(root)
  const ignore = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/tests/fixtures/**',
    ...nestedRepoDirs.map((d) => `${d}/**`),
  ]
  const files = await fg(patterns, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    suppressErrors: true,
    ignore,
  })
  return files.sort((a, b) => a.localeCompare(b))
}

/** Return a `sha256-<hex>` content hash, used for lockfile integrity checks. */
export function hashText(value: string | Buffer): string {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`
}

/**
 * Map `items` through async `fn` in bounded-concurrency batches, preserving input order.
 * An unbounded `Promise.all` over many file reads can open hundreds of descriptors at
 * once and exhaust the per-process fd limit (EMFILE) on low-ulimit systems; chunking
 * caps concurrent work while keeping the one-pass throughput win.
 *
 * @param items - Input list.
 * @param fn - Async mapper invoked per item.
 * @param concurrency - Max in-flight calls per batch (default 24, matching the scanner blob reader).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 24,
): Promise<R[]> {
  // Coerce to a finite positive integer so a fractional/NaN/Infinity argument
  // can't produce fractional loop indices and corrupt results array ordering.
  const size = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 24
  const results: R[] = new Array(items.length)
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    const settled = await Promise.all(batch.map((item, j) => fn(item, i + j)))
    for (let j = 0; j < settled.length; j += 1) results[i + j] = settled[j]
  }
  return results
}
