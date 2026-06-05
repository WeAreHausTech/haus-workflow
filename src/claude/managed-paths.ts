/**
 * Relative paths under `.claude/` and `.haus-workflow/` that `haus apply` manages
 * and `haus undo` may remove. Lockfile `paths` are merged at undo time.
 */
import { claudePath, hausPath } from '../utils/paths.js'

/** Haus-managed files under `.claude/` always written by apply (excluding settings.json). */
export const PROJECT_MANAGED_CLAUDE_REL = [
  'rules/haus.md',
  'rules/security.md',
  'commands/haus-doctor.md',
  'commands/haus-review.md',
] as const

/** Haus-managed artifacts under `.haus-workflow/` written during apply. */
export const PROJECT_MANAGED_HAUS_REL = [
  'selected-context.json',
  'haus.lock.json',
  'config.json',
] as const

/** Absolute paths for core haus-managed project files (lock paths added separately). */
export function coreManagedAbsolutePaths(root: string): string[] {
  const claude = PROJECT_MANAGED_CLAUDE_REL.map((rel) => claudePath(root, rel))
  const haus = PROJECT_MANAGED_HAUS_REL.map((rel) => hausPath(root, rel))
  return [...claude, ...haus]
}
