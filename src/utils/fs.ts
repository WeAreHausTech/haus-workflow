/** Async file I/O helpers used throughout src/ — thin wrappers over fs-extra and fast-glob. */

import crypto from 'node:crypto'
import path from 'node:path'

import fg from 'fast-glob'
import fs from 'fs-extra'

/** Parse a JSON file, returning `undefined` instead of throwing on missing or malformed files. */
export type ReadJsonDetailedResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'missing' }
  | { status: 'invalid'; error: unknown }

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
  await fs.ensureDir(path.dirname(file))
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
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
  await fs.ensureDir(path.dirname(file))
  await fs.writeFile(file, value, 'utf8')
}

export async function exists(file: string): Promise<boolean> {
  return fs.pathExists(file)
}

/**
 * Glob for files matching `patterns` under `root`, excluding node_modules, .git, and dist.
 * Results are sorted for stable ordering across platforms.
 */
export async function listFiles(root: string, patterns: string[]): Promise<string[]> {
  const files = await fg(patterns, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  })
  return files.sort((a, b) => a.localeCompare(b))
}

/** Return a `sha256-<hex>` content hash, used for lockfile integrity checks. */
export function hashText(value: string): string {
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
