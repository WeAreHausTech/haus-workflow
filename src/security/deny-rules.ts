/**
 * Derives Claude Code `permissions.deny` rule strings from the same static lists
 * the runtime guards use, so the deterministic layer (settings.json) and the
 * hook-time backstop (guard-bash / guard-file-access) never drift apart.
 *
 * This is the deterministic half of WORKFLOW.md's "enforce critical rules in
 * BOTH CLAUDE.md and settings.json deny" principle. Rules are enforced by Claude
 * Code at PreToolUse time, before the model sees the call (deny > ask > allow).
 * Syntax per https://code.claude.com/docs/en/permissions.md :
 *   - Bash uses prefix matching: `Bash(rm -rf:*)` (the `:*` ≡ trailing ` *`).
 *   - File tools use gitignore globs: `Read(*.pem)`, `Write(.env)`, `Read(secrets/**)`.
 */
import { DANGEROUS_COMMANDS } from './dangerous-commands.js'
import { SENSITIVE_PATHS } from './sensitive-paths.js'

/** Sensitive entries that name a directory — denied recursively via `<dir>/**`. */
const SENSITIVE_DIRS = new Set([
  'storage/logs',
  'wp-content/uploads',
  'uploads',
  'customer-data',
  'exports',
  'secrets',
  'certs',
])

/** File tools whose access to sensitive paths must be denied. */
const FILE_TOOLS = ['Read', 'Edit', 'Write'] as const

/**
 * Returns the deduped list of `permissions.deny` rule strings haus manages:
 * one Bash prefix-deny per dangerous command, plus Read/Edit/Write denies for
 * every sensitive path (directories denied recursively).
 */
export function buildDenyRules(): string[] {
  const rules: string[] = []

  for (const command of DANGEROUS_COMMANDS) {
    rules.push(`Bash(${command}:*)`)
  }

  for (const path of SENSITIVE_PATHS) {
    const pattern = SENSITIVE_DIRS.has(path) ? `${path}/**` : path
    for (const tool of FILE_TOOLS) {
      rules.push(`${tool}(${pattern})`)
    }
  }

  return [...new Set(rules)]
}
