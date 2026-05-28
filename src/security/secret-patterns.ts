/** Regex patterns used by redactSensitive to identify secret-like values in strings. */

/** Matches common key=value or key:value patterns for API keys, tokens, and passwords. */
export const SECRET_PATTERNS = [/api[_-]?key\s*[:=]\s*\S+/i, /token\s*[:=]\s*\S+/i, /password\s*[:=]\s*\S+/i];
