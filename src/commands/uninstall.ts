/** `haus uninstall` — removes Haus plugin files from the Claude Code config directory. */
import { printUninstallResult, runUninstall } from "../install/uninstall.js";
import { error, log } from "../utils/logger.js";

/** Removes Haus plugin files from the Claude Code config directory; use --force to bypass safety checks. */
export async function runUninstallCommand(options: { force?: boolean }): Promise<void> {
  try {
    const result = await runUninstall({ force: options.force });
    printUninstallResult(result);
    log("haus uninstall complete");
  } catch (err) {
    error(`haus uninstall failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
