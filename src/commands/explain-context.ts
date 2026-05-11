import { readJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import type { Recommendation } from "../types.js";
import { buildRecommendationExplanation } from "../recommender/explain-recommendation.js";

export async function runExplainContext(options: { json?: boolean; stats?: boolean }): Promise<void> {
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

  console.log("Selected:");
  for (const item of explanation.selected) {
    console.log(`- ${item.id}`);
    console.log(`  confidence: ${item.confidenceLevel} (${item.confidence})`);
    console.log(`  selection: ${item.selectionMode}`);
    for (const reason of item.reasons) console.log(`  - ${reason}`);
  }
  console.log("Skipped:");
  for (const item of explanation.skipped) {
    console.log(`- ${item.id}`);
    for (const reason of item.reasons) console.log(`  - ${reason}`);
  }
  if (options.stats) {
    console.log("Stats:");
    console.log(`Selected rules: ${explanation.stats.selectedRules}`);
    console.log(`Skipped rules: ${explanation.stats.skippedRules}`);
    console.log(`Estimated token reduction: ${explanation.stats.estimatedTokenReductionPct}%`);
  }
}
