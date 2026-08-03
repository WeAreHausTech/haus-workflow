/**
 * Reads the cached context map from disk, or runs a scan when the cache is absent
 * or stale relative to package.json.
 * Use this instead of calling scanProject directly when a fresh scan is not required.
 */
import path from 'node:path'

import fs from 'fs-extra'

import type { ContextMap } from '../types.js'
import { readJson } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'

import { scanProject } from './scan-project.js'

/**
 * True when the cached context map is at least as fresh as package.json. When
 * package.json doesn't exist, there is nothing to compare against, so the cache is
 * treated as fresh (avoids forcing a rescan on every call for such projects).
 */
async function isCacheFresh(root: string, cachePath: string): Promise<boolean> {
  const pkgJsonPath = path.join(root, 'package.json')
  if (!(await fs.pathExists(pkgJsonPath))) return true
  const [cacheStat, pkgStat] = await Promise.all([fs.stat(cachePath), fs.stat(pkgJsonPath)])
  return cacheStat.mtimeMs >= pkgStat.mtimeMs
}

/**
 * Returns the project's ContextMap, preferring the cached copy in `.haus-workflow/context-map.json`
 * when it's at least as fresh as package.json. Falls back to a fresh scan when no cached file
 * exists, or when package.json has changed more recently than the cache.
 *
 * @param root - Absolute path to the project root.
 */
export async function readContextOrScan(root: string): Promise<ContextMap> {
  const cachePath = hausPath(root, 'context-map.json')
  const context = await readJson<ContextMap>(cachePath)
  if (context && (await isCacheFresh(root, cachePath))) return context
  const scan = await scanProject(root)
  return scan
}
