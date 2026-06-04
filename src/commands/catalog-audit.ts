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
  for (const item of items) {
    const text = `${item.id} ${item.tags.join(' ')}`.toLowerCase()
    for (const word of FORBIDDEN_TAGS)
      if (text.includes(word.toLowerCase())) failures.push(`${item.id} has unsupported tag ${word}`)
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
