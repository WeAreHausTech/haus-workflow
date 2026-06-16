/** `haus validate-catalog` — validates a catalog manifest at an explicit path. */
import path from 'node:path'

import { validateCatalogData } from '../catalog/validate-core.js'
import type { CatalogItem } from '../types.js'
import { readJson } from '../utils/fs.js'
import { error, log } from '../utils/logger.js'

/**
 * `haus validate-catalog <manifest-path>`
 *
 * Validates a catalog manifest at an explicit path. Used by catalog repo CI:
 *   haus validate-catalog ./manifest.json
 *
 * When run from the catalog repo root, also validates file existence,
 * required frontmatter, and risky install patterns.
 */
export async function runValidateCatalog(manifestPath: string | undefined): Promise<void> {
  if (!manifestPath) {
    error('Usage: haus validate-catalog <path/to/manifest.json>')
    process.exitCode = 1
    return
  }

  const abs = path.resolve(process.cwd(), manifestPath)
  const manifestDir = path.dirname(abs)
  const data = await readJson<{ version?: string; items: CatalogItem[] }>(abs)
  if (!data?.items) {
    error(`Could not read catalog manifest at ${abs}`)
    process.exitCode = 1
    return
  }

  const result = validateCatalogData(manifestDir, data.version, data.items)
  if (!result.ok) {
    result.failures.forEach((f) => error(f))
    process.exitCode = 1
    return
  }

  log(`Catalog valid. ${result.items.length} items checked.`)
}
