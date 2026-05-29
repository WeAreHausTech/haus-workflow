/**
 * Hashes the content of installed files and directories to detect local modifications
 * since the last `haus install` or `haus update` run.
 */
import path from 'node:path'

import fg from 'fast-glob'
import fs from 'fs-extra'

import { hashText } from '../utils/fs.js'

/** Deterministic hash when a lock item has no installed paths yet. */
export const EMPTY_LOCK_PATHS_TOKEN = 'haus-lock:empty-paths'

/**
 * Content-addressed hash for paths under `root` (files or directories).
 * Directories are expanded to all nested files. Missing paths are skipped.
 */
export async function hashInstalledPaths(root: string, relPaths: string[]): Promise<string> {
  if (relPaths.length === 0) {
    return hashText(EMPTY_LOCK_PATHS_TOKEN)
  }
  const normalized = [...new Set(relPaths.map((p) => p.replace(/\\/g, '/')))].sort()
  const fileDigests: Array<{ rel: string; digest: string }> = []

  for (const rel of normalized) {
    const abs = path.join(root, rel)
    if (!(await fs.pathExists(abs))) continue
    const stat = await fs.stat(abs)
    if (stat.isFile()) {
      const body = await fs.readFile(abs, 'utf8')
      fileDigests.push({ rel, digest: hashText(body) })
      continue
    }
    if (!stat.isDirectory()) continue
    const inner = await fg('**/*', { cwd: abs, onlyFiles: true, dot: true })
    for (const sub of inner.sort()) {
      const relFile = path.join(rel, sub).replace(/\\/g, '/')
      const absFile = path.join(abs, sub)
      const body = await fs.readFile(absFile, 'utf8')
      fileDigests.push({ rel: relFile, digest: hashText(body) })
    }
  }

  if (fileDigests.length === 0) {
    return hashText(`${EMPTY_LOCK_PATHS_TOKEN}|${normalized.join('|')}`)
  }
  fileDigests.sort((a, b) => a.rel.localeCompare(b.rel))
  return hashText(fileDigests.map((f) => `${f.rel}=${f.digest}`).join('|'))
}
