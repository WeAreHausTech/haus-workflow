/**
 * Strips sensitive patterns (API keys, tokens, secrets, PEM blocks) before memory is surfaced to Claude.
 */

/**
 * Returns a copy of text with credential-like values replaced by [REDACTED] placeholders.
 * Handles key=value patterns and PEM-encoded key blocks.
 */
export function redactMemory(text: string): string {
  return text
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, "[REDACTED-KEY]");
}
