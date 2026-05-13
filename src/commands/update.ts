import { diffGeneratedFiles, summarizeLockDiff } from "../update/diff-generated-files.js";
import { applyLock, checkLock, diffLock, hasLocalOverrides } from "../update/lockfile.js";
import { log } from "../utils/logger.js";

export async function runUpdate(options: { check?: boolean }): Promise<void> {
  const root = process.cwd();
  if (options.check) {
    const status = await checkLock(root);
    log(
      JSON.stringify(
        {
          ...status,
          localOverrides: await hasLocalOverrides(root),
          summary: diffGeneratedFiles(),
        },
        null,
        2,
      ),
    );
    if (!status.ok) process.exitCode = 1;
    return;
  }
  if (await hasLocalOverrides(root)) {
    log("Local .claude overrides detected. Preserving local files; only lockfile updated.");
  }
  const { before, after } = await applyLock(root);
  log(diffLock(before, after));
  log(summarizeLockDiff(before, after));
  log("Update applied with backup in .haus-ai/backups/. Run haus doctor.");
}
