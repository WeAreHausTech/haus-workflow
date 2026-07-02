/** Shared Claude Code PreToolUse hook I/O: stdin payload parsing + deny verdict emission. */
import { readFileSync } from 'node:fs'

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

/** Result of reading a hook payload: the parsed record, or a malformed flag on bad JSON. */
export type HookPayloadResult = { payload: Record<string, unknown>; malformed: boolean }

/**
 * Reads and parses the Claude Code hook JSON payload from stdin.
 * Empty stdin parses to `{}` (not malformed) — only invalid JSON sets `malformed: true`,
 * so callers can fail closed the way `guard.ts` already does.
 */
export function readHookPayload(): HookPayloadResult {
  const raw = stdin()
  if (!raw) return { payload: {}, malformed: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    return { payload: isRecord(parsed) ? parsed : {}, malformed: false }
  } catch {
    return { payload: {}, malformed: true }
  }
}

/**
 * Emits the PreToolUse deny verdict in the exact shape Claude Code consumes.
 *
 * IMPORTANT: the fields MUST be nested under `hookSpecificOutput` with
 * `hookEventName: "PreToolUse"`, and the process MUST exit 0. A bare top-level
 * `permissionDecision` is silently ignored, and Claude Code only parses hook
 * JSON on exit 0 (a non-zero exit discards it) — either mistake makes the guard
 * fail OPEN: the dangerous command/path is allowed through. Do not "tidy" this
 * by setting a non-zero exit code on deny.
 */
export function emitPreToolUseDeny(reason: string): void {
  log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
}
