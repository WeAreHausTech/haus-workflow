/** `haus catalog-audit` — checks the bundled catalog manifest for unsupported or forbidden stacks. */
import { loadCatalog } from '../catalog/load-catalog.js'
import { FORBIDDEN_TAGS } from '../catalog/validation-rules.js'
import type { CatalogItem } from '../types.js'
import { error, log } from '../utils/logger.js'

/**
 * Returns a failure message per item whose id or tags contain a forbidden word
 * (driven by the canonical FORBIDDEN_TAGS from validation-rules — no private copy,
 * so the two lists can no longer drift). Empty array = all items pass.
 */
export function auditForbiddenTags(items: CatalogItem[]): string[] {
  const failures: string[] = []
  const forbidden = new Set(FORBIDDEN_TAGS.map((w) => w.toLowerCase()))
  for (const item of items) {
    // Exact-match each tag. Substring matching would flag "go" inside "mongodb"
    // or "django", producing false positives.
    for (const tag of item.tags) {
      if (forbidden.has(tag.toLowerCase())) failures.push(`${item.id} has unsupported tag ${tag}`)
    }
    // Check the id separately, tokenised on non-alphanumeric boundaries (keeping
    // "+" so "c++" survives) so a forbidden word only matches a whole id segment.
    for (const token of item.id.toLowerCase().split(/[^a-z0-9+]+/)) {
      if (forbidden.has(token)) failures.push(`${item.id} has unsupported tag ${token}`)
    }
  }
  return failures
}

/** Audits the bundled catalog for forbidden stack/tag names; exits non-zero on any failure. */
export async function runCatalogAudit(): Promise<void> {
  const items = await loadCatalog(process.cwd())
  const failures = auditForbiddenTags(items)
  if (failures.length) {
    failures.forEach((f) => error(f))
    process.exitCode = 1
    return
  }
  log('Catalog audit passed.')
}
