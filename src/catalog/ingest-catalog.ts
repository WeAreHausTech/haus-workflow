/** Content validation at catalog ingest — trust boundary before cache write. */

import type { CatalogItem } from '../types.js'

import { auditForbiddenTagsInText } from './forbidden-content.js'
import {
  ALLOWED_NPX_PATTERN,
  ANY_NPX_PATTERN,
  isNpxTsxOnlyExempt,
  RISKY_INSTALL_PATTERNS,
} from './validation-rules.js'

export type ValidateCatalogItemResult = { ok: true } | { ok: false; reason: string }

/** Validate fetched item content before writing to the local cache. */
export function validateCatalogItem(
  item: Pick<CatalogItem, 'id' | 'type' | 'path'> & { source?: CatalogItem['source'] },
  content: string,
): ValidateCatalogItemResult {
  const label = item.id
  // Curated verbatim content may name tools (`npx playwright`, etc.).
  // Risky-install patterns (npx -y / dlx) are NOT waived (ADR-0005).
  const checkNonTsxNpx = !isNpxTsxOnlyExempt(item.type, item.source)
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (RISKY_INSTALL_PATTERNS.some((re) => re.test(line))) {
      return { ok: false, reason: `${label}: risky install pattern at line ${i + 1}` }
    }
    if (checkNonTsxNpx && ANY_NPX_PATTERN.test(line) && !ALLOWED_NPX_PATTERN.test(line)) {
      return { ok: false, reason: `${label}: disallowed npx at line ${i + 1}` }
    }
  }

  const tagFailures = auditForbiddenTagsInText(content, label)
  if (tagFailures.length > 0) {
    return { ok: false, reason: tagFailures[0]! }
  }

  return { ok: true }
}
