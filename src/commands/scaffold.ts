/**
 * `haus scaffold [ids...]`
 *
 * Copies catalog config items (ESLint, Prettier) to the project root.
 * Run explicitly when bootstrapping a new project or upgrading configs.
 * Does NOT run as part of `haus apply` — config files are user-owned.
 */

import { loadCatalogContext } from '../catalog/load-catalog.js'
import { scaffoldConfigItems } from '../install/scaffold.js'
import type { CatalogItem } from '../types.js'
import { log } from '../utils/logger.js'

export async function runScaffold(
  ids: string[],
  options: { force?: boolean; dryRun?: boolean; root: string },
): Promise<void> {
  const { items: allItems, contentRoot } = await loadCatalogContext(options.root)
  const configItems = (allItems as CatalogItem[]).filter((item) => {
    if (item.type !== 'config') return false
    if (item.reviewStatus && item.reviewStatus !== 'approved') return false
    if (item.riskLevel === 'blocked') return false
    if (ids.length > 0 && !ids.includes(item.id)) return false
    return true
  })

  if (configItems.length === 0) {
    if (ids.length > 0) {
      log(`No config items found for: ${ids.join(', ')}`)
    } else {
      log('No config items available in catalog.')
    }
    return
  }

  log(`Scaffolding ${configItems.length} config item(s)…`)

  const result = await scaffoldConfigItems(options.root, contentRoot, configItems, {
    force: options.force,
    dryRun: options.dryRun,
  })

  if (result.scaffolded.length > 0) {
    if (options.dryRun) {
      log(`[dry-run] would scaffold: ${result.scaffolded.join(', ')} (no files written)`)
    } else {
      log(`✓ Scaffolded: ${result.scaffolded.join(', ')}`)
    }
  }
  if (result.skipped.length > 0) {
    log(`Skipped (already exist): ${result.skipped.join(', ')}`)
    log('Run with --force to overwrite.')
  }
}
