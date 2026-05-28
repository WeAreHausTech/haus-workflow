/** Strips secret-like values from strings before they appear in outputs or memory. */

import { SECRET_PATTERNS } from "./secret-patterns.js";

/**
 * Replaces all secret-like substrings in `input` with `[REDACTED]`.
 * @param input - Raw string that may contain secrets.
 * @returns Sanitized string safe for logging or storage.
 */
export function redactSensitive(input: string): string {
  // Apply each pattern in sequence so all secret types are covered
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), input);
}
