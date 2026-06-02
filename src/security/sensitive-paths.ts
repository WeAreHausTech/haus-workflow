/**
 * Single home for all sensitive-path knowledge. Three consumers match in three
 * different ways, so each gets the shape it needs — but the data lives only here:
 *   - `SENSITIVE_PATHS`        → guard-file-access (substring, `*` stripped)
 *   - `SENSITIVE_PATH_REGEXES` → scanner (anchored regex, stricter than substring)
 *   - `SENSITIVE_ITEM_KEYWORDS`→ recommender (flags a catalog item by id/tag substring)
 */

/**
 * Glob-like substrings matched against a candidate file path.
 * Wildcards (`*`) are stripped before the substring check.
 */
export const SENSITIVE_PATHS = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'id_rsa',
  'id_ed25519',
  '*.sql',
  '*.dump',
  '*.backup',
  '*.bak',
  'storage/logs',
  'wp-content/uploads',
  'uploads',
  'customer-data',
  'exports',
  'secrets',
  'certs',
]

/**
 * Anchored regexes for paths the scanner must never read during a scan, regardless
 * of SAFE_FILES. Stricter than substring matching (e.g. `*.pem` → `/\.pem$/`).
 */
export const SENSITIVE_PATH_REGEXES = [
  /^\.env(\.|$)/,
  /(^|\/)\.env(\.|$)/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /\.sql$/,
  /\.dump$/,
  /customer-data/,
  /exports/,
  /certs/,
  /secrets/,
  /(^|\/)storage\/logs(\/|$)/,
  /(^|\/)wp-content\/uploads(\/|$)/,
  /(^|\/)uploads(\/|$)/,
]

/**
 * Substrings that flag a CATALOG ITEM as security-sensitive (matched against the
 * item id + tags). A deliberately small subset — broadening it changes recommendations.
 */
export const SENSITIVE_ITEM_KEYWORDS = [
  '.env',
  'secrets',
  'certs',
  'customer-data',
  'exports',
  '.pem',
  '.key',
]
