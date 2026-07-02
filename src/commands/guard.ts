/** `haus guard` — PreToolUse hook that blocks dangerous bash commands and sensitive file-access paths. */
import { emitPreToolUseDeny, readHookPayload } from '../claude/hook-io.js'
import { guardBash } from '../security/guard-bash.js'
import { guardFileAccess } from '../security/guard-file-access.js'
import { isRecord } from '../utils/audit-checks.js'

/**
 * Reads a Claude Code hook payload from stdin and denies the tool call if it violates security rules.
 * Outputs a JSON `{ hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }` response when blocking.
 */
export async function runGuard(
  kind: 'file-access' | 'bash',
  _options: { fromHook?: boolean },
): Promise<void> {
  const { payload, malformed } = readHookPayload()
  if (malformed) {
    emitPreToolUseDeny('Malformed hook payload')
    return
  }
  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : {}

  if (kind === 'file-access') {
    const candidate = String(toolInput.path ?? toolInput.file_path ?? '')
    const reason = guardFileAccess(candidate)
    if (reason) {
      emitPreToolUseDeny(reason)
    }
    return
  }
  const command = String(toolInput.command ?? '')
  const reason = guardBash(command)
  if (reason) {
    emitPreToolUseDeny(reason)
  }
}
