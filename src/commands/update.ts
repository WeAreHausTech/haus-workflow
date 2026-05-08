import { applyLock, checkLock } from "../update/lockfile.js";

export async function runUpdate(options: { check?: boolean }): Promise<void> {
  const root = process.cwd();
  if (options.check) {
    const status = await checkLock(root);
    console.log(JSON.stringify(status, null, 2));
    if (!status.ok) process.exitCode = 1;
    return;
  }
  await applyLock(root);
  console.log("Update applied. Run haus doctor.");
}
