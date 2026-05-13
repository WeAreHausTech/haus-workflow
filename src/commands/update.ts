import { diffGeneratedFiles, summarizeLockDiff } from "../update/diff-generated-files.js";
import { applyLock, checkLock, diffLock, hasLocalOverrides } from "../update/lockfile.js";

export async function runUpdate(options: { check?: boolean }): Promise<void> {
  const root = process.cwd();
  if (options.check) {
    const status = await checkLock(root);
    console.log(
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
    console.log("Local .claude overrides detected. Preserving local files; only lockfile updated.");
  }
  const { before, after } = await applyLock(root);
  console.log(diffLock(before, after));
  console.log(summarizeLockDiff(before, after));
  console.log("Update applied with backup in .haus-ai/backups/. Run haus doctor.");
}
