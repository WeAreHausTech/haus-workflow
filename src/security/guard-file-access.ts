/** Guard that blocks file-path access matching known sensitive path patterns. */

import { SENSITIVE_PATHS } from './sensitive-paths.js'

/**
 * Returns a block message if `candidate` matches a sensitive path pattern, otherwise `undefined`.
 * @param candidate - File path string to evaluate.
 */
export function guardFileAccess(candidate: string): string | undefined {
  // Strip glob wildcards before substring matching — patterns like "*.pem" become ".pem"
  const matched = SENSITIVE_PATHS.find((token) => candidate.includes(token.replace('*', '')))
  // Plain-language reason (non-devs hit these) that still names the blocked path.
  // No backticks: emitted as a JSON permissionDecisionReason the UI may render as
  // Markdown, so backticks in the path itself could break formatting.
  if (matched) return `I didn't open ${candidate} — it looks like it holds secrets or sensitive data`
  return undefined
}
