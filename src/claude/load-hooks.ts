/**
 * Defines the canonical hook configuration written to .claude/settings.json.
 * The hook set is inlined here (no external file) so it is always in sync with the package.
 */

import { buildAskRules } from '../security/ask-rules.js'
import { buildDenyRules } from '../security/deny-rules.js'

type HookBlock = { matcher: string; hooks: Array<{ type: 'command'; command: string }> }

/** Shape written to `.claude/settings.json` under `hooks` (+ deterministic deny/ask rules). */
export type ClaudeHooksSettings = {
  hooks: {
    PreToolUse?: HookBlock[]
    Stop?: HookBlock[]
    [event: string]: HookBlock[] | undefined
  }
  permissions?: { deny: string[]; ask?: string[] }
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
    PreToolUse: [
      {
        matcher: 'Read|Edit|Write',
        hooks: [{ type: 'command', command: 'haus guard file-access --from-hook' }],
      },
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'haus guard bash --from-hook' }],
      },
    ],
    Stop: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command: 'haus decisions suggest --from-hook' }],
      },
    ],
  },
}

/**
 * Returns the canonical project settings: inlined hooks plus the deterministic
 * `permissions.deny` rules (WORKFLOW.md "enforce in both"). One source so the
 * writer and both contract verifiers stay consistent.
 */
export async function loadClaudeHooksSettings(): Promise<ClaudeHooksSettings> {
  return { ...CANONICAL_HOOKS, permissions: { deny: buildDenyRules(), ask: buildAskRules() } }
}
