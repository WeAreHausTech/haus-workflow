import { buildContextExplanation, formatContextHuman } from "../recommender/explain-formatters.js";
import { normalizeRecommendation } from "../recommender/explain-recommendation.js";
import { classifyTaskIntents, pickTaskRelevantRules, type TaskIntent } from "../recommender/task-intent.js";
import type { Recommendation } from "../types.js";
import { readJson } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { hausPath } from "../utils/paths.js";

export async function runExplainContext(options: { json?: boolean; stats?: boolean; task?: string }): Promise<void> {
  const root = process.cwd();
  const rec = await readJson<Recommendation>(hausPath(root, "recommendation.json"));
  if (!rec) {
    throw new Error("No recommendation found. Run `haus recommend` first.");
  }

  const normalized = normalizeRecommendation(rec);
  const taskIntents = options.task ? classifyTaskIntents(options.task) : new Set<TaskIntent>();
  const includedRules = options.task
    ? pickTaskRelevantRules(normalized, options.task, taskIntents)
    : normalized.recommended;
  const includedIds = new Set(includedRules.map((rule) => rule.id));
  const explanation = buildContextExplanation(normalized, options.task, taskIntents, includedIds);

  if (options.json) {
    log(JSON.stringify(explanation, null, 2));
    return;
  }
  log(formatContextHuman(options.task, explanation, { stats: options.stats }));
}
