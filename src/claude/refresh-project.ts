/**
 * Shared project refresh helpers used by `haus update` and other core flows.
 * Kept out of command modules so command handlers do not import each other.
 */
import fs from 'fs-extra'

import type { ClaudeSettings } from '../install/settings-merge.js'
import { readJsonDetailed } from '../utils/fs.js'
import { claudePath, hausPath } from '../utils/paths.js'

import { writeClaudeFiles } from './write-claude-files.js'

/**
 * True when this directory has prior haus setup artifacts. Lock alone is not enough —
 * `haus update` may create an empty lock before re-apply runs.
 */
export async function isHausProject(root: string): Promise<boolean> {
  if (await fs.pathExists(hausPath(root, 'recommendation.json'))) return true
  const result = await readJsonDetailed<ClaudeSettings>(claudePath(root, 'settings.json'))
  if (result.status === 'ok') return result.value._haus != null
  return false
}

/**
 * Re-applies haus-managed project files (core `.claude/` outputs + lock-tracked catalog
 * items from `recommendation.json`). Safe to call from `haus update`: settings are merged,
 * not replaced. Returns written paths, or `[]` when the project was never set up by haus.
 */
export async function refreshProjectApply(root: string): Promise<string[]> {
  if (!(await isHausProject(root))) return []
  return writeClaudeFiles(root, false, undefined, { refillConfig: false })
}
