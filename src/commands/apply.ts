/** `haus apply` — writes recommended catalog items and core Claude files to .claude/. */
import path from 'node:path'

import checkbox from '@inquirer/checkbox'

import { getCacheDir } from '../catalog/remote-catalog.js'
import { writeClaudeFiles } from '../claude/write-claude-files.js'
import type { Recommendation } from '../types.js'
import { readJson } from '../utils/fs.js'
import { error, log, warn } from '../utils/logger.js'
import { displayPath, hausPath } from '../utils/paths.js'

/** Normalize a commander variadic/CSV option into a flat, trimmed id list. */
function parseIdList(value: string[] | string | undefined): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

async function cacheHasItems(): Promise<boolean> {
  const data = await readJson<{ items?: unknown[] }>(path.join(getCacheDir(), 'manifest.json'))
  return Array.isArray(data?.items) && data.items.length > 0
}

/** Recommended entries `haus apply` may install (excludes config scaffold hints). */
export function installableRecommendedItems(
  recommended: Recommendation['recommended'],
): Recommendation['recommended'] {
  return recommended.filter((item) => item.install !== false)
}

/**
 * Applies recommended catalog items and core Claude files to the current project.
 * Requires --dry-run or --write; use --select for interactive item filtering.
 */
export async function runApply(options: {
  dryRun?: boolean
  write?: boolean
  select?: boolean
  ids?: string[] | string
  allowEmptyCache?: boolean
  refillConfig?: boolean
  force?: boolean
}): Promise<void> {
  if (!options.dryRun && !options.write) {
    log('Use --dry-run or --write')
    return
  }
  const root = process.cwd()
  const isDryRun = Boolean(options.dryRun) && !options.write

  let selectedIds: string[] | undefined

  // Non-interactive explicit selection (skill backend; no TTY checkbox).
  // `--ids` and `--select` are mutually exclusive.
  const explicitIds = parseIdList(options.ids)
  if (explicitIds.length > 0) {
    if (options.select) {
      error('Use either --select (interactive) or --ids (explicit), not both')
      process.exitCode = 1
      return
    }
    const rec = await readJson<Recommendation>(hausPath(root, 'recommendation.json'))
    const recommended = rec?.recommended ?? []
    const installableIds = new Set(installableRecommendedItems(recommended).map((i) => i.id))
    // Diagnose each non-installable id with the reason that actually applies, so the
    // hint points at the right fix (scaffold for config, --include for skipped, etc.).
    const configIds = new Set(recommended.filter((i) => i.install === false).map((i) => i.id))
    const skippedIds = new Set((rec?.skipped ?? []).map((s) => s.id))
    for (const id of explicitIds.filter((id) => !installableIds.has(id))) {
      if (configIds.has(id)) {
        warn(`--ids: "${id}" is a config item — install it with \`haus scaffold ${id}\`. Ignoring.`)
      } else if (skippedIds.has(id)) {
        warn(
          `--ids: "${id}" is not currently recommended (skipped) — add it with \`haus recommend --include ${id}\` first. Ignoring.`,
        )
      } else {
        warn(
          `--ids: "${id}" is not in recommendation.json — run \`haus recommend\` (or \`--include ${id}\`) first. Ignoring.`,
        )
      }
    }
    selectedIds = explicitIds.filter((id) => installableIds.has(id))
    log(`Applying ${selectedIds.length} explicitly selected catalog item(s).`)
  }

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
    } else {
      const items = installableRecommendedItems(rec.recommended)
      if (items.length === 0) {
        log('Recommendation contains no catalog items. Writing core files only.')
        selectedIds = []
      } else {
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
  }

  // Block apply when catalog cache is empty and no fixture override is set,
  // unless the recommendation has no catalog items to install or the user
  // explicitly opts in via --allow-empty-cache. Tests/fixtures set
  // HAUS_FIXTURE_CATALOG and are exempt.
  if (!options.allowEmptyCache && !process.env['HAUS_FIXTURE_CATALOG']) {
    const rec = await readJson<Recommendation>(hausPath(root, 'recommendation.json'))
    const installableRecommended = installableRecommendedItems(rec?.recommended ?? [])
    const catalogItemCount =
      selectedIds !== undefined ? selectedIds.length : installableRecommended.length
    if (catalogItemCount > 0 && !(await cacheHasItems())) {
      const message = 'No catalog content found. Run `haus update` first.'
      if (isDryRun) {
        warn(`Catalog cache is empty — dry-run will skip catalog items. ${message}`)
      } else {
        error(message)
        process.exitCode = 1
        return
      }
    }
  }

  const files = await writeClaudeFiles(root, isDryRun, selectedIds, {
    refillConfig: options.refillConfig,
    force: options.force,
  })
  if (isDryRun) {
    log(`Dry-run complete — ${files.length} file(s) planned, none written. Run --write to apply.`)
  } else {
    log('Applied files:')
    files.forEach((f) => log(`- ${displayPath(root, f)}`))
  }
}
