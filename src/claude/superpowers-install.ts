/**
 * Apply-time install helpers for curated pcvelz/superpowers catalog items.
 * Copies full skill trees, installs shared support files, and rewrites upstream
 * path prose in installed markdown only (catalog cache stays verbatim).
 */

import path from 'node:path'

import fg from 'fast-glob'
import fs from 'fs-extra'

import { SUPERPOWERS_SHARED_CATALOG_REL } from '../catalog/constants.js'
import { claudePath } from '../utils/paths.js'

export const SUPERPOWERS_ORIGIN_SOURCE_ID = 'superpowers-pcvelz'

export const SUPERPOWERS_SHARED_INSTALL_REL = '.claude/skills/shared'

const PATH_REWRITES: ReadonlyArray<readonly [string, string]> = [
  ['skills/shared/', '.claude/skills/shared/'],
]

/** Rewrite upstream-relative shared paths for installed project copies. */
export function rewriteSuperpowersMarkdown(text: string): string {
  let out = text
  for (const [from, to] of PATH_REWRITES) {
    out = out.split(from).join(to)
  }
  return out
}

async function rewriteMarkdownTree(dir: string): Promise<void> {
  const files = await fg('**/*.md', { cwd: dir, onlyFiles: true, dot: true })
  for (const rel of files) {
    const abs = path.join(dir, rel)
    const text = await fs.readFile(abs, 'utf8')
    const rewritten = rewriteSuperpowersMarkdown(text)
    if (rewritten !== text) {
      await fs.writeFile(abs, rewritten, 'utf8')
    }
  }
}

/** Copy a catalog skill directory into `.claude/skills/<name>/`, rewriting superpowers markdown. */
export async function installCatalogSkill(
  sourcePath: string,
  destination: string,
  opts: { originSourceId?: string; dryRun: boolean },
): Promise<void> {
  if (opts.dryRun) return
  await fs.ensureDir(path.dirname(destination))
  await fs.copy(sourcePath, destination, { overwrite: true, errorOnExist: false })
  if (opts.originSourceId === SUPERPOWERS_ORIGIN_SOURCE_ID) {
    await rewriteMarkdownTree(destination)
  }
}

/**
 * Copy `skills/superpowers/shared/` from the catalog content root to
 * `.claude/skills/shared/`. Returns the project-relative install path, or null.
 */
export async function installSuperpowersShared(
  contentRoot: string,
  projectRoot: string,
  dryRun: boolean,
): Promise<string | null> {
  const source = path.join(contentRoot, SUPERPOWERS_SHARED_CATALOG_REL)
  if (!(await fs.pathExists(source))) return null
  const destination = claudePath(projectRoot, 'skills', 'shared')
  if (dryRun) return path.relative(projectRoot, destination)
  await fs.ensureDir(path.dirname(destination))
  await fs.copy(source, destination, { overwrite: true, errorOnExist: false })
  await rewriteMarkdownTree(destination)
  return path.relative(projectRoot, destination)
}
