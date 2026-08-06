/**
 * Hashes the content of installed files and directories to detect local modifications
 * since the last `haus install` or `haus update` run.
 */
import path from 'node:path'

import fg from 'fast-glob'
import fs from 'fs-extra'

import { normaliseLF } from '../claude/managed-template.js'
import { hashText } from '../utils/fs.js'

/** Deterministic hash when a lock item has no installed paths yet. */
export const EMPTY_LOCK_PATHS_TOKEN = 'haus-lock:empty-paths'

/**
 * Digests one file's content. Text (valid UTF-8, matching JS's lossless decode/encode
 * round-trip) is LF-normalized first so line-ending changes alone don't register as
 * drift. Anything that doesn't round-trip losslessly (binary content) is hashed by its
 * raw bytes instead — decoding it as UTF-8 first would replace invalid byte sequences
 * with U+FFFD, silently collapsing distinct binary content to the same hash.
 */
function digestFileContent(buf: Buffer): string {
  const asText = buf.toString('utf8')
  const roundTrip = Buffer.from(asText, 'utf8')
  if (roundTrip.equals(buf)) {
    return hashText(normaliseLF(asText))
  }
  return hashText(buf)
}

export type HashInstalledPathsOptions = {
  /**
   * Default `true` (unchanged behavior for existing callers — catalog-item lock
   * hashing). Pass `false` when the caller has its own symlink-refusal posture at
   * copy time (e.g. `link-context`'s `link.ts`, which never copies a symlink) —
   * `false` uses `lstat` for the top-level path and excludes any symlinked entry
   * found while expanding a directory, so the recorded hash reflects only content
   * that can actually, safely be copied — never content read through a symlink
   * that could point outside the repo.
   */
  followSymlinks?: boolean
}

/**
 * Content-addressed hash for paths under `root` (files or directories).
 * Directories are expanded to all nested files. Missing paths are skipped.
 */
export async function hashInstalledPaths(
  root: string,
  relPaths: string[],
  opts: HashInstalledPathsOptions = {},
): Promise<string> {
  const followSymlinks = opts.followSymlinks ?? true
  if (relPaths.length === 0) {
    return hashText(EMPTY_LOCK_PATHS_TOKEN)
  }
  const normalized = [...new Set(relPaths.map((p) => p.replace(/\\/g, '/')))].sort()
  const fileDigests: Array<{ rel: string; digest: string }> = []

  for (const rel of normalized) {
    const abs = path.join(root, rel)
    if (!(await fs.pathExists(abs))) continue
    const stat = followSymlinks ? await fs.stat(abs) : await fs.lstat(abs)
    if (!followSymlinks && stat.isSymbolicLink()) continue
    if (stat.isFile()) {
      const body = await fs.readFile(abs)
      fileDigests.push({ rel, digest: digestFileContent(body) })
      continue
    }
    if (!stat.isDirectory()) continue
    const inner = await fg('**/*', {
      cwd: abs,
      onlyFiles: true,
      dot: true,
      followSymbolicLinks: followSymlinks,
    })
    for (const sub of inner.sort()) {
      const absFile = path.join(abs, sub)
      // fast-glob's followSymbolicLinks:false stops it from descending into a
      // symlinked *directory*, but a symlinked *file* entry can still surface as
      // a match — lstat-check each one explicitly to exclude it too.
      if (!followSymlinks && (await fs.lstat(absFile)).isSymbolicLink()) continue
      const relFile = path.join(rel, sub).replace(/\\/g, '/')
      const body = await fs.readFile(absFile)
      fileDigests.push({ rel: relFile, digest: digestFileContent(body) })
    }
  }

  if (fileDigests.length === 0) {
    return hashText(`${EMPTY_LOCK_PATHS_TOKEN}|${normalized.join('|')}`)
  }
  fileDigests.sort((a, b) => a.rel.localeCompare(b.rel))
  return hashText(fileDigests.map((f) => `${f.rel}=${f.digest}`).join('|'))
}
