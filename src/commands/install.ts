/** `haus install` — seeds `~/.claude/` with Haus-managed skills, agents, and hook settings. */
import { applyInstall, printApplyResult } from '../install/apply.js'
import { printCompanionToolSuggestions } from '../install/companion-tools.js'
import { error, log } from '../utils/logger.js'

/**
 * Seeds `~/.claude/` with Haus-managed skills, agents, and hook settings.
 * Use --check to detect drift without writing, --dry-run to preview, --force to overwrite.
 * --postinstall is used by the npm postinstall hook: it prints a clear notice of what
 * was changed in the user's ~/.claude (since that edit is otherwise silent) plus how to undo.
 */
export async function runInstall(options: {
  dryRun?: boolean
  force?: boolean
  check?: boolean
  postinstall?: boolean
}): Promise<void> {
  try {
    const result = await applyInstall({
      dryRun: options.dryRun,
      force: options.force,
      check: options.check,
    })

    // The detailed file list is useful for an interactive run, but noise when npm
    // surfaces postinstall output — there the concise notice below is the signal.
    if (!options.postinstall) printApplyResult(result, options.dryRun ?? false)

    if (options.check && result.drift) {
      process.exitCode = 1
    } else if (!options.check && !options.dryRun) {
      printCompanionToolSuggestions()
      const total = result.created.length + result.updated.length
      if (options.postinstall) {
        // npm just installed haus globally and ran this automatically. The user did
        // not type a command, so spell out exactly what we changed and how to undo it.
        // Distinguish added vs updated, and phrase settings as "ensured present" so an
        // idempotent re-run doesn't read as a fresh change.
        log('haus configured Claude Code for you:')
        const parts = []
        if (result.created.length) parts.push(`${result.created.length} file(s) added`)
        if (result.updated.length) parts.push(`${result.updated.length} file(s) updated`)
        log(
          parts.length
            ? `  • ${parts.join(', ')} in ~/.claude (skills, slash commands)`
            : '  • already up to date — no files changed',
        )
        log(`  • ensured hooks + security rules are present in ~/.claude/settings.json`)
        log('Undo any time with:  haus uninstall')
        log('Disable this on install:  HAUS_NO_POSTINSTALL=1')
      } else {
        log(
          `haus install complete (${total} file(s) written, ${result.hookIds.length} hook(s) added)`,
        )
      }
    }
  } catch (err) {
    error(`haus install failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}
