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
 * - Single-file items: copy the file directly (e.g. `configs/eslint/eslint.config.js` → `<root>/eslint.config.js`).
 * - Directory items: copy all files in the directory to the project root (e.g. `configs/prettier/` → `<root>/`).
 */
export async function scaffoldConfigItems(
  projectRoot: string,
  catalogRoot: string,
  items: CatalogItem[],
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<ScaffoldResult> {
  const scaffolded: string[] = []
  const skipped: string[] = []

  for (const item of items) {
    if (item.type !== 'config') continue

    const sourcePath = path.resolve(catalogRoot, item.path)
    // Containment guard: a malformed/malicious item.path (e.g. '../../etc/passwd')
    // must not let scaffold read files outside the catalog content root.
    const rel = path.relative(catalogRoot, sourcePath)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      warn(`Skipping ${item.id}: path '${item.path}' escapes the catalog root`)
      continue
    }

    const stat = await fs.stat(sourcePath).catch(() => null)
    if (!stat) {
      warn(`Skipping ${item.id}: source not found at ${sourcePath}`)
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
  const exists = await fs.pathExists(dest)

  if (exists && !opts.force) {
    warn(`Skipping ${path.basename(dest)}: already exists (use --force to overwrite)`)
    return 'skipped'
  }

  if (opts.dryRun) {
    log(`[dry-run] would ${exists ? 'overwrite' : 'create'} ${path.basename(dest)} (${itemId})`)
    return 'scaffolded'
  }

  await fs.ensureDir(path.dirname(dest))
  await fs.copy(src, dest, { overwrite: true })
  log(`${exists ? 'Overwrote' : 'Created'} ${path.basename(dest)} (${itemId})`)
  return 'scaffolded'
}
