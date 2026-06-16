/** Guard that hard-blocks file-path access matching deny-tier path patterns. */

import { DENY_PATH_REGEXES, normalizePathForMatch } from './sensitive-paths.js'

/**
 * Returns a block message if `candidate` matches a deny-tier path pattern, otherwise `undefined`.
 * ASK_PATHS are not blocked here — they go through `permissions.ask` instead.
 * @param candidate - File path string to evaluate.
 */
export function guardFileAccess(candidate: string): string | undefined {
  const normalized = normalizePathForMatch(candidate)
  const matched = DENY_PATH_REGEXES.find((re) => re.test(normalized))
  // Plain-language reason (non-devs hit these) that still names the blocked path.
  // No backticks: emitted as a JSON permissionDecisionReason the UI may render as
  // Markdown, so backticks in the path itself could break formatting.
  if (matched)
    return `I didn't open ${candidate} — it looks like it holds secrets or sensitive data`
  return undefined
}
