/** Compares installed hashes against the lockfile to detect stale or missing items. */
import { checkLock, type LockCheckResult } from './lockfile.js'

/** Returns lock validity, item count, and installed-file hash drift. */
export async function checkUpdates(root: string): Promise<LockCheckResult> {
  return checkLock(root)
}
