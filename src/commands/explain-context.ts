import { readJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";

export async function runExplainContext(): Promise<void> {
  const root = process.cwd();
  const rec = await readJson<{ recommended: Array<{ id: string; reason: string }>; skipped: Array<{ id: string; reason: string }> }>(
    hausPath(root, "recommendation.json")
  );
  console.log("Selected:");
  for (const item of rec?.recommended ?? []) console.log(`- ${item.id}: ${item.reason}`);
  console.log("Skipped:");
  for (const item of rec?.skipped ?? []) console.log(`- ${item.id}: ${item.reason}`);
}
