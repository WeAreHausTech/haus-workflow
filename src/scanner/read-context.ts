/**
 * Reads the cached context map from disk, or runs a scan when the cache is absent
 * or stale relative to package.json, `haus.workspace.yaml`, or `repos.manifest.json`.
 * Use this instead of calling scanProject directly when a fresh scan is not required.
 */
import path from 'node:path'

import fs from 'fs-extra'

import { WORKSPACE_FILE } from '../commands/workspace/config.js'
import type { ContextMap } from '../types.js'
import { readJson } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'
import { REPOS_MANIFEST_FILE } from '../workspace/members.js'

import { scanProject } from './scan-project.js'

/**
 * True when the cached context map is at least as fresh as every marker file whose
 * presence changes detection: package.json (the original check) plus the two
 * workspace/meta-repo markers, `haus.workspace.yaml` and `repos.manifest.json`.
 *
 * Without the latter two, a workspace root that has no `package.json` of its own
 * (a pure meta-repo aggregating sibling repos) would never invalidate its cache on
 * this path — `isCacheFresh` short-circuited `true` whenever package.json was
 * absent, so a `context-map.json` scanned before the meta-repo pattern existed
 * (e.g. carrying a stale per-app role such as `dotnet-service`) would linger
 * forever once a workspace marker was added, since there was nothing to compare
 * mtimes against. See Task 3.5,
 * docs/plans/workspace-detection-and-permissions-fixes.md.
 *
 * When none of the three markers exist, there is nothing to compare against, so the
 * cache is treated as fresh (avoids forcing a rescan on every call for such projects).
 */
async function isCacheFresh(root: string, cachePath: string): Promise<boolean> {
  const markerPaths = [
    path.join(root, 'package.json'),
    path.join(root, WORKSPACE_FILE),
    path.join(root, REPOS_MANIFEST_FILE),
  ]
  const cacheStat = await fs.stat(cachePath)
  for (const markerPath of markerPaths) {
    if (!(await fs.pathExists(markerPath))) continue
    const markerStat = await fs.stat(markerPath)
    if (markerStat.mtimeMs > cacheStat.mtimeMs) return false
  }
  return true
}

/**
 * Returns the project's ContextMap, preferring the cached copy in `.haus-workflow/context-map.json`
 * when it's at least as fresh as package.json and any workspace marker file. Falls back to a
 * fresh scan when no cached file exists, or when any of those has changed more recently than
 * the cache.
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
