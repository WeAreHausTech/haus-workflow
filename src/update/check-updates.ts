/** Compares installed hashes against the lockfile to detect stale or missing items. */
import { checkLock } from './lockfile.js'

/** Returns whether the lockfile is valid and how many items it contains. */
export async function checkUpdates(root: string): Promise<{ ok: boolean; count: number }> {
  return checkLock(root)
}
