import { SECRET_PATTERNS } from "./secret-patterns.js";

export function redactSensitive(input: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), input);
}
