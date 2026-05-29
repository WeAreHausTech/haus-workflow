/** `haus uninstall` — removes Haus-managed skills, agents, and hook entries from `~/.claude/`. */
import { printUninstallResult, runUninstall } from '../install/uninstall.js'
import { error, log } from '../utils/logger.js'

/** Removes Haus-managed skills, agents, and hook entries from `~/.claude/`; use --force to bypass safety checks. */
export async function runUninstallCommand(options: { force?: boolean }): Promise<void> {
  try {
    const result = await runUninstall({ force: options.force })
    printUninstallResult(result)
    log('haus uninstall complete')
  } catch (err) {
    error(`haus uninstall failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}
