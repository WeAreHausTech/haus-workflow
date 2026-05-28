/** Fetches new catalog versions and re-applies changed lock items to the project. */
import { applyLock } from "./lockfile.js";

/** Re-hashes all installed lock items under `root` and writes the updated lockfile. */
export async function applyUpdates(root: string): Promise<void> {
  await applyLock(root);
}
