/**
 * Reads the cached context map from disk, or runs a fast scan when the cache is absent.
 * Use this instead of calling scanProject directly when a fresh scan is not required.
 */
import type { ContextMap } from '../types.js'
import { readJson } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'

import { scanProject } from './scan-project.js'

/**
 * Returns the project's ContextMap, preferring the cached copy in `.haus-workflow/context-map.json`.
 * Falls back to a `"fast"` scan when no cached file exists (e.g. first run).
 *
 * @param root - Absolute path to the project root.
 */
export async function readContextOrScan(root: string): Promise<ContextMap> {
  // Use the cached copy when available to avoid rescanning on every command.
  const context = await readJson<ContextMap>(hausPath(root, 'context-map.json'))
  if (context) return context
  const scan = await scanProject(root)
  return scan
}
