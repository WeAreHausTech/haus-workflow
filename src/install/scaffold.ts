/**
 * Scaffold catalog config items into the project root.
 * Unlike `haus apply`, this is explicit and user-initiated — it does not auto-run.
 * Existing files are preserved by default; use `force: true` to overwrite.
 */

import path from 'node:path'

import fs from 'fs-extra'

import type { CatalogItem } from '../types.js'
import { log, warn } from '../utils/logger.js'

export type ScaffoldResult = {
  scaffolded: string[]
  skipped: string[]
}

/**
 * Copy catalog config items to the project root.
 * - Single-file items: copy the file directly (e.g. `configs/eslint/eslint.config.mjs` → `<root>/eslint.config.mjs`).
 * - Directory items: copy each immediate entry of the directory into the project root
 *   (e.g. `configs/prettier/` → `<root>/`). A subdirectory entry is copied whole (its
 *   subtree preserved); symlinks are never replicated. Existing files are preserved
 *   unless `force` is set.
 */
export async function scaffoldConfigItems(
  projectRoot: string,
  catalogRoot: string,
  items: CatalogItem[],
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<ScaffoldResult> {
  const scaffolded: string[] = []
  const skipped: string[] = []

  // Resolve symlinks in the catalog root once so per-item containment compares
  // fully-resolved real paths (see realSource check below).
  const realRoot = await fs.realpath(catalogRoot).catch(() => null)

  for (const item of items) {
    if (item.type !== 'config') continue

    const sourcePath = path.resolve(catalogRoot, item.path)
    // Containment guard 1 (string): a malformed/malicious item.path (e.g.
    // '../../etc/passwd') must not point outside the catalog content root. Check
    // for '..' as a path *segment* — a leading-".." filename ('..eslintrc') is fine.
    const rel = path.relative(catalogRoot, sourcePath)
    const escapes =
      rel === '' || path.isAbsolute(rel) || rel.split(/[/\\]/).some((seg) => seg === '..')
    if (escapes) {
      warn(`Skipping ${item.id}: path '${item.path}' escapes the catalog root`)
      continue
    }

    // Containment guard 2 (realpath): a symlinked *parent directory* inside the
    // catalog (e.g. configs/evil -> /etc, item.path configs/evil/hosts) passes the
    // string check but resolves outside the root on disk. Compare real paths.
    const realSource = await fs.realpath(sourcePath).catch(() => null)
    if (!realRoot || !realSource) {
      warn(`Skipping ${item.id}: source not found at ${sourcePath}`)
      continue
    }
    const realRel = path.relative(realRoot, realSource)
    if (realRel !== '' && (path.isAbsolute(realRel) || realRel.split(/[/\\]/)[0] === '..')) {
      warn(`Skipping ${item.id}: path '${item.path}' resolves outside the catalog root`)
      continue
    }

    // lstat (not stat): a symlinked source must be refused, never followed.
    const stat = await fs.lstat(sourcePath).catch(() => null)
    if (!stat) {
      warn(`Skipping ${item.id}: source not found at ${sourcePath}`)
      continue
    }
    if (stat.isSymbolicLink()) {
      warn(`Skipping ${item.id}: source path is a symlink`)
      continue
    }

    if (stat.isFile()) {
      const filename = path.basename(sourcePath)
      const dest = path.join(projectRoot, filename)
      const result = await scaffoldFile(sourcePath, dest, item.id, opts)
      if (result === 'scaffolded') scaffolded.push(filename)
      else skipped.push(filename)
    } else if (stat.isDirectory()) {
      const entries = await fs.readdir(sourcePath)
      for (const entry of entries) {
        const src = path.join(sourcePath, entry)
        const dest = path.join(projectRoot, entry)
        const result = await scaffoldFile(src, dest, item.id, opts)
        if (result === 'scaffolded') scaffolded.push(entry)
        else skipped.push(entry)
      }
    }
  }

  return { scaffolded, skipped }
}

async function scaffoldFile(
  src: string,
  dest: string,
  itemId: string,
  opts: { force?: boolean; dryRun?: boolean },
): Promise<'scaffolded' | 'skipped'> {
  // Refuse symlinked catalog content: a malicious link could point outside the
  // catalog root, which the string-based containment check above cannot detect.
  const srcStat = await fs.lstat(src).catch(() => null)
  if (!srcStat) {
    warn(`Skipping ${path.basename(src)}: source not found`)
    return 'skipped'
  }
  if (srcStat.isSymbolicLink()) {
    warn(`Skipping ${path.basename(src)}: source is a symlink`)
    return 'skipped'
  }

  const exists = await fs.pathExists(dest)

  if (exists && !opts.force) {
    warn(`Skipping ${path.basename(dest)}: already exists (use --force to overwrite)`)
    return 'skipped'
  }

  if (opts.dryRun) {
    log(`[dry-run] would ${exists ? 'overwrite' : 'create'} ${path.basename(dest)} (${itemId})`)
    return 'scaffolded'
  }

  // On overwrite, remove the existing dest first so the result matches the source
  // exactly — fs.copy does not prune upstream-deleted files and can otherwise merge
  // into a dest of the wrong type (e.g. a dir where the source is now a file).
  if (exists && opts.force) {
    await fs.remove(dest)
  }

  await fs.ensureDir(path.dirname(dest))
  // dereference:false + filter: never replicate a symlink (e.g. nested inside a
  // directory item) into the project root.
  await fs.copy(src, dest, {
    overwrite: true,
    dereference: false,
    filter: (s) => !fs.lstatSync(s).isSymbolicLink(),
  })
  log(`${exists ? 'Overwrote' : 'Created'} ${path.basename(dest)} (${itemId})`)
  return 'scaffolded'
}
