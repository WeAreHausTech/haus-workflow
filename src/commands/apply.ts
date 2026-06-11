/** `haus apply` — writes recommended catalog items and core Claude files to .claude/. */
import path from 'node:path'

import checkbox from '@inquirer/checkbox'
import fs from 'fs-extra'

import { getCacheDir } from '../catalog/remote-catalog.js'
import { readProjectSettings } from '../claude/merge-project-settings.js'
import { writeClaudeFiles } from '../claude/write-claude-files.js'
import type { Recommendation } from '../types.js'
import { readJson } from '../utils/fs.js'
import { error, log, warn } from '../utils/logger.js'
import { claudePath, displayPath, hausPath } from '../utils/paths.js'

async function cacheHasItems(): Promise<boolean> {
  const data = await readJson<{ items?: unknown[] }>(path.join(getCacheDir(), 'manifest.json'))
  return Array.isArray(data?.items) && data.items.length > 0
}

/**
 * Applies recommended catalog items and core Claude files to the current project.
 * Requires --dry-run or --write; use --select for interactive item filtering.
 */
export async function runApply(options: {
  dryRun?: boolean
  write?: boolean
  select?: boolean
  allowEmptyCache?: boolean
  refillConfig?: boolean
}): Promise<void> {
  if (!options.dryRun && !options.write) {
    log('Use --dry-run or --write')
    return
  }
  const root = process.cwd()
  const isDryRun = Boolean(options.dryRun) && !options.write

  let selectedIds: string[] | undefined

  if (options.select) {
    if (!process.stdin.isTTY) {
      error('--select requires an interactive terminal (stdin is not a TTY)')
      process.exitCode = 1
      return
    }
    const rec = await readJson<Recommendation>(hausPath(root, 'recommendation.json'))
    if (!rec) {
      log('No recommendation.json found — run `haus recommend` first. Writing core files only.')
      selectedIds = []
    } else if (rec.recommended.length === 0) {
      log('Recommendation contains no catalog items. Writing core files only.')
      selectedIds = []
    } else {
      const items = rec.recommended
      const choices = items.map((item) => ({
        name: `${item.id}  [${item.selectionMode}] — ${item.reason}`,
        value: item.id,
        checked: true,
      }))
      const chosen = await checkbox({
        message: 'Select catalog items to apply (space to toggle, enter to confirm):',
        choices,
        pageSize: Math.min(20, items.length + 2),
      })
      selectedIds = chosen as string[]
      log(`Selected ${selectedIds.length} of ${items.length} catalog items.`)
    }
  }

  // Block apply when catalog cache is empty and no fixture override is set,
  // unless the recommendation has no catalog items to install or the user
  // explicitly opts in via --allow-empty-cache. Tests/fixtures set
  // HAUS_FIXTURE_CATALOG and are exempt.
  if (!options.allowEmptyCache && !process.env['HAUS_FIXTURE_CATALOG']) {
    const rec = await readJson<Recommendation>(hausPath(root, 'recommendation.json'))
    const catalogItemCount =
      selectedIds !== undefined ? selectedIds.length : (rec?.recommended.length ?? 0)
    if (catalogItemCount > 0 && !(await cacheHasItems())) {
      warn(
        isDryRun
          ? 'Catalog cache is empty — `haus apply --write` will skip catalog items. Run `haus update` first.'
          : 'Catalog cache is empty — catalog items will be skipped. Run `haus update` first, or pass --allow-empty-cache to silence this warning.',
      )
    }
  }

  const files = await writeClaudeFiles(root, isDryRun, selectedIds, {
    refillConfig: options.refillConfig,
  })
  if (isDryRun) {
    log(`Dry-run complete — ${files.length} file(s) planned, none written. Run --write to apply.`)
  } else {
    log('Applied files:')
    files.forEach((f) => log(`- ${displayPath(root, f)}`))
  }
}

/**
 * True when this directory has prior haus setup artifacts. Lock alone is not enough —
 * `haus update` may create an empty lock before re-apply runs.
 */
async function isHausProject(root: string): Promise<boolean> {
  if (await fs.pathExists(hausPath(root, 'recommendation.json'))) return true
  if (await fs.pathExists(claudePath(root, 'settings.json'))) {
    const settings = await readProjectSettings(root)
    if (settings._haus != null) return true
  }
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
