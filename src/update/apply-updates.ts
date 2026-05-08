import { applyLock } from "./lockfile.js";

export async function applyUpdates(root: string): Promise<void> {
  await applyLock(root);
}
