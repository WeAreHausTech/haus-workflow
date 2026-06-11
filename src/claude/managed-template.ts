/** Shared utilities for HAUS-MANAGED template files. */

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
  const match = line.match(/<!-- HAUS-MANAGED id=([\w.:-]+)/)
  if (!match) return null
  const vMatch = line.match(/\bv=(\d+)/)
  const sourceMatch = line.match(/\bsource=([^\s]+)/)
  const hashMatch = line.match(/hash=(sha256-[a-f0-9]+)/)
  return {
    id: match[1],
    v: vMatch ? Number(vMatch[1]) : undefined,
    source: sourceMatch?.[1],
    hash: hashMatch?.[1],
  }
}
