import { readJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import type { Recommendation } from "../types.js";
import { buildRecommendationExplanation } from "../recommender/explain-recommendation.js";

export async function runExplainRecommendation(options: { json?: boolean }): Promise<void> {
  const root = process.cwd();
  const rec = await readJson<Recommendation>(hausPath(root, "recommendation.json"));
  if (!rec) {
    throw new Error("No recommendation found. Run `haus recommend` first.");
  }
  const explanation = buildRecommendationExplanation(rec);
  if (options.json) {
    console.log(JSON.stringify(explanation, null, 2));
    return;
  }

  console.log("Recommendation explanation");
  console.log(`Selected: ${explanation.stats.selectedRules}`);
  console.log(`Skipped: ${explanation.stats.skippedRules}`);
  for (const item of explanation.selected) {
    console.log(`- ${item.id} (${item.confidenceLevel})`);
    for (const reason of item.reasons) console.log(`  - ${reason}`);
  }
}
