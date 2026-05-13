import { readAllowedStacks } from "./allowed-stacks.js";
import { loadCatalog } from "./load-catalog.js";

export async function validateCatalog(root: string): Promise<string[]> {
  const allowed = new Set((await readAllowedStacks(root)).map((x) => x.toLowerCase()));
  const items = await loadCatalog(root);
  const failures: string[] = [];
  for (const item of items) {
    for (const tag of item.tags) {
      if (
        !allowed.has(tag.toLowerCase()) &&
        tag.includes("-patterns") === false &&
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
