/**
 * `haus workspace link-context` — thin handler. Real logic lives under
 * `src/workspace/link-context/*`. See
 * docs/plans/workspace-detection-and-permissions-fixes.md — Task 3.4b-e (D6, revised).
 */
import { error, log, warn } from '../../utils/logger.js'
import { runLinkContext, type LinkContextOptions } from '../../workspace/link-context/link.js'

export type LinkContextCliOptions = {
  write?: boolean
  json?: boolean
}

export async function runWorkspaceLinkContext(
  workspaceRoot: string,
  opts: LinkContextCliOptions = {},
): Promise<void> {
  const options: LinkContextOptions = { write: opts.write, json: opts.json }
  const result = await runLinkContext(workspaceRoot, options)

  if (!result.ok) {
    if (opts.json) {
      log(JSON.stringify(result, null, 2))
    } else {
      error(result.error)
    }
    process.exitCode = 1
    return
  }

  if (opts.json) {
    log(JSON.stringify(result, null, 2))
    return
  }

  for (const s of result.skipped) warn(`  skip ${s.repo}: ${s.reason}`)

  if (result.dryRun) {
    log(
      `[dry-run] Would link ${result.linked.length} skill/agent/command copy(ies) into .claude/ ` +
        `(${result.added.length} new, ${result.removed.length} to remove). Re-run with --write to apply.`,
    )
    return
  }

  log(
    `Linked ${result.linked.length} skill/agent/command copy(ies) into .claude/ ` +
      `(${result.added.length} new, ${result.removed.length} removed).`,
  )
  log(
    'Source of truth for each copy stays in its own member repo — do not edit the copies ' +
      'directly; re-run `haus workspace link-context` after editing a source, or when ' +
      '`haus workspace doctor` flags one stale.',
  )
}
