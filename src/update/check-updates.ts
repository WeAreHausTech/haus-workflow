import { checkLock } from "./lockfile.js";

export async function checkUpdates(root: string): Promise<{ ok: boolean; count: number }> {
  return checkLock(root);
}
