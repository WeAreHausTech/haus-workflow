/**
 * Shared tamper/staleness comparison for HAUS-MANAGED template files (WORKFLOW.md
 * today). Used by both the writer (write-workflow.ts) and the reader (doctor.ts) so
 * the two never independently drift on what counts as "tampered" vs "stale".
 */
import { hashText } from '../utils/fs.js'

import { normaliseLF } from './managed-template.js'

export type ManagedTamperVerdict =
  | { status: 'ok' }
  | { status: 'tampered' } // hash present and body no longer matches it
  | { status: 'stale' } // hash matches its own recorded value, but the template itself changed
  | { status: 'legacy-ok' } // no verifiable hash, but body matches current template
  | { status: 'legacy-diverged' } // no verifiable hash, body does NOT match current template

/**
 * Compares an installed managed file's body against its own recorded hash (if any)
 * and the current template content, returning one verdict for callers to act on.
 *
 * @param body - The installed file's content, with the HAUS-MANAGED header line stripped.
 * @param storedHash - The `hash=sha256-...` value from the file's header, or undefined
 *   when the header predates hashing (legacy) or the hash field is otherwise absent.
 * @param templateContent - The current template content to compare staleness against,
 *   or null when it could not be resolved (cache and bundled snapshot both missing).
 */
export function checkManagedTamper(
  body: string,
  storedHash: string | undefined,
  templateContent: string | null,
): ManagedTamperVerdict {
  const bodyHash = hashText(normaliseLF(body))

  if (storedHash) {
    if (bodyHash !== storedHash) return { status: 'tampered' }
    if (templateContent === null) return { status: 'ok' }
    const currentTemplateHash = hashText(normaliseLF(templateContent))
    return storedHash !== currentTemplateHash ? { status: 'stale' } : { status: 'ok' }
  }

  // No verifiable hash (legacy header). We can only compare the body against the
  // CURRENT template — we have no record of what hash the body was written with.
  if (templateContent === null) return { status: 'legacy-ok' }
  const currentTemplateHash = hashText(normaliseLF(templateContent))
  return bodyHash === currentTemplateHash ? { status: 'legacy-ok' } : { status: 'legacy-diverged' }
}
