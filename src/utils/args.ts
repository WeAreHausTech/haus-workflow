/** Shared CLI option parsing helpers. */

/**
 * Normalize a commander variadic/CSV option into a flat, trimmed, non-empty id list.
 * Accepts both `--opt a b c` (array) and `--opt a,b,c` (single CSV string).
 */
export function parseIdList(value: string[] | string | undefined): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}
