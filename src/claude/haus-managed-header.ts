/** Shared parser for `<!-- HAUS-MANAGED ... -->` marker attributes. */

export type HausManagedHeaderAttrs = {
  id: string
  v?: string
  source?: string
  hash?: string
}

/**
 * Parse marker attributes from a single `<!-- HAUS-MANAGED ... -->` line.
 * Returns null if the line is not a managed header comment.
 */
export function parseHausManagedAttrs(line: string): HausManagedHeaderAttrs | null {
  const match = /^<!--\s+HAUS-MANAGED\b(.*?)-->$/.exec(line.trim())
  if (!match) return null
  const raw = match[1] ?? ''
  const pairs = [...raw.matchAll(/\b([a-z]+)=([^\s>]+)/g)]
  const attrs: Record<string, string> = {}
  for (const [, key, value] of pairs) attrs[key] = value
  if (!attrs.id) return null
  return {
    id: attrs.id,
    v: attrs.v,
    source: attrs.source,
    hash: attrs.hash,
  }
}
