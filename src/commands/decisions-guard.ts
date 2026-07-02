/** `haus decisions guard` — PreToolUse hook that blocks `gh pr create` when the diff needs an ADR. */
import { emitPreToolUseDeny, readHookPayload } from '../claude/hook-io.js'
import { resolveBaseRef } from '../decisions/base-ref.js'
import { runDecisionsCheck } from '../decisions/check.js'
import { isRecord } from '../utils/audit-checks.js'
import { runGit } from '../utils/exec.js'

// Substring match, consistent with guardBash — a literal "gh pr create" inside an unrelated
// string (e.g. an echo) also matches; accepted tradeoff, not a bug.
const PR_CREATE_PATTERN = /\bgh\s+pr\s+create\b/

export type DecisionsGuardOptions = {
  /** Accepted for CLI flag parity with `--from-hook`; not currently branched on. */
  fromHook?: boolean
  /** Test-only: inject the hook payload instead of reading real stdin. */
  stdinPayload?: string
}

function readPayload(options: DecisionsGuardOptions): {
  payload: Record<string, unknown>
  malformed: boolean
} {
  if (options.stdinPayload != null) {
    try {
      const parsed: unknown = JSON.parse(options.stdinPayload)
      return { payload: isRecord(parsed) ? parsed : {}, malformed: false }
    } catch {
      return { payload: {}, malformed: true }
    }
  }
  return readHookPayload()
}

export async function runDecisionsGuard(options: DecisionsGuardOptions = {}): Promise<void> {
  const { payload, malformed } = readPayload(options)
  if (malformed) {
    emitPreToolUseDeny('Malformed hook payload')
    return
  }
  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : {}
  const command = String(toolInput.command ?? '')
  if (!PR_CREATE_PATTERN.test(command)) return

  const root = process.cwd()
  const baseRef = await resolveBaseRef(root)
  if (!baseRef) return // no discoverable base branch — fail open rather than block on ambiguity

  const range = `${baseRef}...HEAD`
  const commitMessages = (await runGit(['log', '--format=%B', range], { cwd: root })).stdout

  const result = await runDecisionsCheck(root, { range, commitMessages })
  if (result.triggered && !result.satisfied) {
    emitPreToolUseDeny(
      `I didn't run that — this change needs an ADR before opening a PR (${result.reasons.join('; ')}). ` +
        'Run haus decisions suggest, add the decision under docs/decisions/, then retry.',
    )
  }
}
