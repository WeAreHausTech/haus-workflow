/** Content validation at catalog ingest — trust boundary before cache write. */

import type { CatalogItem } from '../types.js'

import { auditForbiddenTagsInText } from './forbidden-content.js'
import {
  ALLOWED_NPX_PATTERN,
  ANY_NPX_PATTERN,
  BANNED_AGENT_PHRASES,
  RISKY_INSTALL_PATTERNS,
} from './validation-rules.js'

export type ValidateCatalogItemResult = { ok: true } | { ok: false; reason: string }

/** Validate fetched item content before writing to the local cache. */
export function validateCatalogItem(
  item: Pick<CatalogItem, 'id' | 'type' | 'path'>,
  content: string,
): ValidateCatalogItemResult {
  const label = item.id
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (RISKY_INSTALL_PATTERNS.some((re) => re.test(line))) {
      return { ok: false, reason: `${label}: risky install pattern at line ${i + 1}` }
    }
    if (ANY_NPX_PATTERN.test(line) && !ALLOWED_NPX_PATTERN.test(line)) {
      return { ok: false, reason: `${label}: disallowed npx at line ${i + 1}` }
    }
  }

  const lower = content.toLowerCase()
  for (const phrase of BANNED_AGENT_PHRASES) {
    if (lower.includes(phrase)) {
      return { ok: false, reason: `${label}: banned phrase "${phrase}"` }
    }
  }

  const tagFailures = auditForbiddenTagsInText(content, label)
  if (tagFailures.length > 0) {
    return { ok: false, reason: tagFailures[0]! }
  }

  return { ok: true }
}
