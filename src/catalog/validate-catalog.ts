/**
 * Validates a loaded catalog manifest against schema constraints and business rules.
 * Returns a list of human-readable failure messages (empty array = all items valid).
 */

import { readAllowedStacks } from "./allowed-stacks.js";
import { loadCatalog } from "./load-catalog.js";

/**
 * Loads the catalog and returns violation messages for any item whose tags fall outside
 * the project's allowed-stacks list (excluding meta-tags like "haus", "security", "quality").
 * @param root - Absolute path to the project root.
 */
export async function validateCatalog(root: string): Promise<string[]> {
  const allowed = new Set((await readAllowedStacks(root)).map((x) => x.toLowerCase()));
  const items = await loadCatalog(root);
  const failures: string[] = [];
  for (const item of items) {
    for (const tag of item.tags) {
      if (
        !allowed.has(tag.toLowerCase()) &&
        tag.includes("-patterns") === false && // pattern-suffix tags are convention, not stack names
        tag !== "haus" &&
        tag !== "security" &&
        tag !== "quality"
      ) {
        failures.push(`${item.id}: tag not allowlisted -> ${tag}`);
      }
    }
  }
  return failures;
}
