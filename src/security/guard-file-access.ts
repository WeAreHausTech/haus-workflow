/** Guard that blocks file-path access matching known sensitive path patterns. */

import { SENSITIVE_PATHS } from "./sensitive-paths.js";

/**
 * Returns a block message if `candidate` matches a sensitive path pattern, otherwise `undefined`.
 * @param candidate - File path string to evaluate.
 */
export function guardFileAccess(candidate: string): string | undefined {
  // Strip glob wildcards before substring matching — patterns like "*.pem" become ".pem"
  const matched = SENSITIVE_PATHS.find((token) => candidate.includes(token.replace("*", "")));
  if (matched) return `Blocked sensitive path: ${candidate}`;
  return undefined;
}
