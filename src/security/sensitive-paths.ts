/** Path patterns that the file-access guard treats as sensitive and will block. */

/**
 * Glob-like substrings matched against a candidate file path.
 * Wildcards (`*`) are stripped before the substring check.
 */
export const SENSITIVE_PATHS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "id_rsa",
  "id_ed25519",
  "*.sql",
  "*.dump",
  "*.backup",
  "*.bak",
  "storage/logs",
  "wp-content/uploads",
  "uploads",
  "customer-data",
  "exports",
  "secrets",
  "certs",
];
