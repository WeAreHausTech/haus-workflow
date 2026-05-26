// HAUS-PRERELEASE-CLEANUP: P4b — curation + library audit artifacts removed before v0.1.
/**
 * Terms that must not appear as standalone stack signals in source-decisions
 * accepted-idea fields. Matching is identifier-aware: "javascript" does not
 * match "java"; "google" does not match "go".
 */
export const UNSUPPORTED_STACK_TERMS = [
  "python",
  "django",
  "go",
  "rust",
  "java",
  "spring",
  "kotlin",
  "swift",
  "android",
  "flutter",
  "dart",
  "c++",
  "trading",
  "healthcare",
] as const;

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True if `text` contains any unsupported term as its own token (ASCII
 * letters, digits, underscore are word characters; hyphen breaks tokens).
 */
export function containsUnsupportedStackMention(text: string): boolean {
  for (const term of UNSUPPORTED_STACK_TERMS) {
    const escaped = escapeRegexLiteral(term);
    const re = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i");
    if (re.test(text)) return true;
  }
  return false;
}
