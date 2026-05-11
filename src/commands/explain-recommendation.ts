import { readJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import type { Recommendation } from "../types.js";
import {
  buildRecommendationExplanation,
  normalizeRecommendation
} from "../recommender/explain-recommendation.js";
import { formatRecommendationHuman } from "../recommender/explain-formatters.js";

export async function runExplainRecommendation(options: { json?: boolean }): Promise<void> {
  const root = process.cwd();
  const rec = await readJson<Recommendation>(hausPath(root, "recommendation.json"));
  if (!rec) {
    throw new Error("No recommendation found. Run `haus recommend` first.");
  }
  const normalized = normalizeRecommendation(rec);
  if (options.json) {
    const explanation = buildRecommendationExplanation(normalized);
    console.log(JSON.stringify(explanation, null, 2));
    return;
  }
  console.log(formatRecommendationHuman(normalized));
}
