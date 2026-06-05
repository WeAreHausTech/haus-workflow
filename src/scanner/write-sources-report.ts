/**
 * Writes `.haus-workflow/sources-report.json` — trust status per catalog source id.
 * The recommender reads this to gate non-haus items (see recommend.ts source-approval).
 */
import { loadCatalog } from '../catalog/load-catalog.js'
import type { CatalogItem } from '../types.js'
import { writeJson } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'

export type SourceTrustStatus = 'approved' | 'candidate' | 'rejected'

export type SourcesReport = {
  generatedAt: string
  items: Array<{ id: string; status: SourceTrustStatus }>
}

/** Derive per-source trust from catalog metadata (haus sources are implicit). */
export function buildSourcesReport(items: CatalogItem[]): SourcesReport {
  const statusBySource = new Map<string, SourceTrustStatus>()

  for (const item of items) {
    const src = item.source?.trim()
    if (!src || src === 'haus') continue

    if (src === 'curated') {
      if (item.reviewStatus === 'approved' && item.riskLevel !== 'blocked') {
        statusBySource.set('curated', 'approved')
      } else if (!statusBySource.has('curated')) {
        statusBySource.set('curated', 'candidate')
      }
      continue
    }

    if (item.reviewStatus === 'approved' && item.riskLevel !== 'blocked') {
      statusBySource.set(src, 'approved')
    } else if (!statusBySource.has(src)) {
      statusBySource.set(src, 'candidate')
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    items: [...statusBySource.entries()]
      .map(([id, status]) => ({ id, status }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
}

/** Refresh sources-report.json from the active catalog manifest. */
export async function writeSourcesReport(root: string): Promise<SourcesReport> {
  const items = await loadCatalog(root)
  const report = buildSourcesReport(items)
  await writeJson(hausPath(root, 'sources-report.json'), report)
  return report
}
