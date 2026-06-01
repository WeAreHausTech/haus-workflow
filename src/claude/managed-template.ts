/** Shared utilities for HAUS-MANAGED template files. */

/** Normalise line endings to LF before hashing — prevents false "user modified" on CRLF systems. */
export function normaliseLF(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** Parse a HAUS-MANAGED header line; returns null when the line is not a managed header. */
export function parseHausManagedHeader(line: string): { id: string; hash?: string } | null {
  const match = line.match(/<!-- HAUS-MANAGED id=([\w.:-]+)/)
  if (!match) return null
  const hashMatch = line.match(/hash=(sha256-[a-f0-9]+)/)
  return { id: match[1], hash: hashMatch?.[1] }
}
