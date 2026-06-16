/**
 * Single home for all sensitive-path knowledge. Consumers:
 *   - `DENY_PATHS`             → guard-file-access (hard block) + permissions.deny
 *   - `ASK_PATHS`              → permissions.ask (per-tool, no guard block)
 *   - `SENSITIVE_PATH_REGEXES` → scanner (anchored regex, conservative bulk-scan guard)
 *   - `SENSITIVE_ITEM_KEYWORDS`→ recommender (flags a catalog item by id/tag substring)
 */

/** File-tool operations. */
export type FileTool = 'Read' | 'Edit' | 'Write'

/**
 * Glob-like patterns for paths that are hard-denied across all three file tools.
 * Wildcards (`*`) are stripped before the substring check in the guard.
 * Directories are expanded to `<dir>/**` when building permission rule strings.
 */
export const DENY_PATHS = [
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'id_rsa',
  'id_ed25519',
  'customer-data',
  'secrets',
  'certs',
]

/** Subset of DENY_PATHS that are directories — expanded to `<dir>/**` in rule strings. */
export const DENY_DIRS = new Set(['customer-data', 'secrets', 'certs'])

/** Anchored deny-tier path regexes used by runtime file-access guard. */
export const DENY_PATH_REGEXES = [
  /(^|\/)[^/]+\.pem$/i,
  /(^|\/)[^/]+\.key$/i,
  /(^|\/)[^/]+\.p12$/i,
  /(^|\/)[^/]+\.pfx$/i,
  /(^|\/)id_rsa$/i,
  /(^|\/)id_ed25519$/i,
  /(^|\/)customer-data(\/|$)/i,
  /(^|\/)secrets(\/|$)/i,
  /(^|\/)certs(\/|$)/i,
]

/** Normalize candidate paths for anchored regex checks. */
export function normalizePathForMatch(candidate: string): string {
  return candidate.replace(/\\/g, '/').replace(/\/+/g, '/').trim()
}

/**
 * Paths in the ask tier: Claude must prompt the user before accessing these.
 * Each entry specifies which file tools require a prompt (Read may be omitted
 * for write-sensitive paths where reading is acceptable without confirmation).
 * Patterns with `/**` suffix are already directory-expanded.
 */
export const ASK_PATHS: { pattern: string; tools: FileTool[] }[] = [
  { pattern: '.env', tools: ['Edit', 'Write'] },
  { pattern: '.env.*', tools: ['Edit', 'Write'] },
  { pattern: 'storage/logs/**', tools: ['Edit', 'Write'] },
  { pattern: 'exports/**', tools: ['Edit', 'Write'] },
  { pattern: '*.dump', tools: ['Read', 'Edit', 'Write'] },
  { pattern: '*.backup', tools: ['Read', 'Edit', 'Write'] },
  { pattern: '*.bak', tools: ['Read', 'Edit', 'Write'] },
  { pattern: 'wp-content/uploads/**', tools: ['Read', 'Edit', 'Write'] },
  { pattern: 'uploads/**', tools: ['Read', 'Edit', 'Write'] },
]

/**
 * Anchored regexes for paths the scanner must never read during a bulk scan.
 * Stricter than substring matching. Kept conservative regardless of the ask tier —
 * bulk auto-scan skipping is independent of on-demand Claude access.
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
