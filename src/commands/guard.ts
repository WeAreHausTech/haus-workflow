/** `haus guard` — PreToolUse hook that blocks dangerous bash commands and sensitive file-access paths. */
import { readFileSync } from 'node:fs'

import { guardBash } from '../security/guard-bash.js'
import { guardFileAccess } from '../security/guard-file-access.js'
import { isRecord } from '../utils/audit-checks.js'
import { log } from '../utils/logger.js'

function stdin(): string {
  try {
    if (process.stdin.isTTY) return ''
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function deny(reason: string): void {
  log(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: reason }))
}

/**
 * Reads a Claude Code hook payload from stdin and denies the tool call if it violates security rules.
 * Outputs a JSON `{ permissionDecision: "deny", ... }` response when blocking.
 */
export async function runGuard(
  kind: 'file-access' | 'bash',
  _options: { fromHook?: boolean },
): Promise<void> {
  const raw = stdin()
  let payload: Record<string, unknown> = {}
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed)) payload = parsed
    } catch {
      deny('Malformed hook payload')
      process.exitCode = 1
      return
    }
  }
  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : {}

  if (kind === 'file-access') {
    const candidate = String(toolInput.path ?? toolInput.file_path ?? '')
    const reason = guardFileAccess(candidate)
    if (reason) {
      // Emit the guard's own plain-language reason (the human reads this).
      deny(reason)
      process.exitCode = 1
      return
    }
    return
  }
  const command = String(toolInput.command ?? '')
  const reason = guardBash(command)
  if (reason) {
    deny(reason)
    process.exitCode = 1
  }
}
