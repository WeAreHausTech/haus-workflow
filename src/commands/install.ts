/** `haus install` — installs or checks Haus plugin files (hooks, settings) into the Claude Code config directory. */
import { applyInstall, printApplyResult } from "../install/apply.js";
import { error, log } from "../utils/logger.js";

/**
 * Installs Haus plugin files into the Claude Code config directory.
 * Use --check to detect drift without writing, --dry-run to preview, --force to overwrite.
 */
export async function runInstall(options: { dryRun?: boolean; force?: boolean; check?: boolean }): Promise<void> {
  try {
    const result = await applyInstall({
      dryRun: options.dryRun,
      force: options.force,
      check: options.check,
    });

    printApplyResult(result, options.dryRun ?? false);

    if (options.check && result.drift) {
      process.exitCode = 1;
    } else if (!options.check && !options.dryRun) {
      const total = result.created.length + result.updated.length;
      log(`haus install complete (${total} file(s) written, ${result.hookIds.length} hook(s) added)`);
    }
  } catch (err) {
    error(`haus install failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
