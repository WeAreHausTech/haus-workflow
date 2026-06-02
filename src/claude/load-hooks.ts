/**
 * Defines the canonical hook configuration written to .claude/settings.json.
 * The hook set is inlined here (no external file) so it is always in sync with the package.
 */

import { buildDenyRules } from '../security/deny-rules.js'

/** Shape written to `.claude/settings.json` under `hooks` (+ deterministic deny rules). */
export type ClaudeHooksSettings = {
  hooks: {
    UserPromptSubmit: Array<{ hooks: Array<{ type: 'command'; command: string }> }>
    PreToolUse: Array<{ matcher: string; hooks: Array<{ type: 'command'; command: string }> }>
  }
  permissions?: { deny: string[] }
}

/**
 * Canonical hook config — source of truth for `.claude/settings.json`.
 *
 * Previously loaded from `plugin/hooks/hooks.json` (removed in P4e). The
 * hook set is now inlined here. P5 will migrate these into
 * `library/global/settings/` and write them into `~/.claude/settings.json`
 * via `haus install`.
 */
export const CANONICAL_HOOKS: ClaudeHooksSettings = {
  hooks: {
    UserPromptSubmit: [
      {
        hooks: [{ type: 'command', command: 'haus context --from-hook || true' }],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Read|Edit|Write',
        hooks: [{ type: 'command', command: 'haus guard file-access --from-hook || true' }],
      },
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'haus guard bash --from-hook || true' }],
      },
    ],
  },
}

/** Maps known hook commands to stable IDs used in recommended-hooks.json. */
const STABLE_HOOK_IDS: Record<string, string> = {
  'haus context --from-hook || true': 'haus.context-hook',
  'haus guard file-access --from-hook || true': 'haus.guard-file',
  'haus guard bash --from-hook || true': 'haus.guard-bash',
}

/**
 * Returns the canonical project settings: inlined hooks plus the deterministic
 * `permissions.deny` rules (WORKFLOW.md "enforce in both"). One source so the
 * writer and both contract verifiers stay consistent.
 */
export async function loadClaudeHooksSettings(): Promise<ClaudeHooksSettings> {
  return { ...CANONICAL_HOOKS, permissions: { deny: buildDenyRules() } }
}

/** Flat list for `.haus-workflow/recommended-hooks.json` (ids stable for known commands). */
export function flattenRecommendedHooks(
  settings: ClaudeHooksSettings,
): Array<{ id: string; command: string }> {
  const out: Array<{ id: string; command: string }> = []
  let generic = 0
  for (const block of settings.hooks.UserPromptSubmit) {
    for (const h of block.hooks) {
      const id = STABLE_HOOK_IDS[h.command] ?? `haus.hook.user-${generic++}`
      out.push({ id, command: h.command })
    }
  }
  for (const block of settings.hooks.PreToolUse) {
    for (const h of block.hooks) {
      const id = STABLE_HOOK_IDS[h.command] ?? `haus.hook.pre-${generic++}`
      out.push({ id, command: h.command })
    }
  }
  return out
}
