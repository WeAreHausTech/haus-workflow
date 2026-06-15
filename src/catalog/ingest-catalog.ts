/** Content validation at catalog ingest — trust boundary before cache write. */

import type { CatalogItem } from '../types.js'

import { auditForbiddenTagsInText } from './forbidden-content.js'
import {
  ALLOWED_NPX_PATTERN,
  ANY_NPX_PATTERN,
  NPX_TSX_ONLY_EXEMPT_TYPES,
  RISKY_INSTALL_PATTERNS,
} from './validation-rules.js'

export type ValidateCatalogItemResult = { ok: true } | { ok: false; reason: string }

/** Validate fetched item content before writing to the local cache. */
export function validateCatalogItem(
  item: Pick<CatalogItem, 'id' | 'type' | 'path'>,
  content: string,
): ValidateCatalogItemResult {
  const label = item.id
  // Agent definitions are AI-instruction prose where `npx <tool>` is legitimate guidance,
  // not a catalog-executed installer — waive the "only npx tsx" ban for exempt types.
  // Risky-install patterns (npx -y / dlx) are NOT waived (see ADR-0003).
  const checkNonTsxNpx = !NPX_TSX_ONLY_EXEMPT_TYPES.includes(item.type)
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
