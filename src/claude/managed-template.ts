/** Shared utilities for HAUS-MANAGED template files. */

import { parseHausManagedAttrs } from './haus-managed-header.js'

/** Normalise line endings to LF before hashing — prevents false "user modified" on CRLF systems. */
export function normaliseLF(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** Managed-template format version — bumped when the HAUS-MANAGED block structure changes. */
export const SCHEMA_VERSION = 1

export type ParsedHausManagedHeader = {
  id: string
  v?: number
  source?: string
  hash?: string
}

/** Parse a HAUS-MANAGED header line; returns null when the line is not a managed header. */
export function parseHausManagedHeader(line: string): ParsedHausManagedHeader | null {
  const attrs = parseHausManagedAttrs(line)
  if (!attrs?.id) return null
  const parsedV = attrs.v && /^\d+$/.test(attrs.v) ? Number(attrs.v) : undefined
  const hash = attrs.hash && /^sha256-[a-f0-9]+$/.test(attrs.hash) ? attrs.hash : undefined
  return {
    id: attrs.id,
    v: parsedV,
    source: attrs.source,
    hash,
  }
}
