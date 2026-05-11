import { readJson, readText } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { readContextOrScan } from "../scanner/read-context.js";
import type { Recommendation } from "../types.js";
import { normalizeRecommendation } from "../recommender/explain-recommendation.js";
import {
  classifyTaskIntents,
  computeRuleIntents,
  type TaskIntent
} from "../recommender/task-intent.js";

type RecommendedRule = Recommendation["recommended"][number];

export async function runContext(options: { task?: string; fromHook?: boolean; json?: boolean }): Promise<void> {
  const root = process.cwd();
  const context = await readContextOrScan(root);
  const summary = (await readText(hausPath(root, "repo-summary.md"))) ?? "";
  const recommendationRaw = await readJson<Recommendation>(hausPath(root, "recommendation.json"));
  const recommendation = recommendationRaw ? normalizeRecommendation(recommendationRaw) : undefined;
  const taskIntents = options.task ? classifyTaskIntents(options.task) : new Set<TaskIntent>();
  const selected = pickTaskRelevantRules(recommendation, options.task, taskIntents);
  const payload = {
    task: options.task ?? "not provided",
    taskIntents: [...taskIntents].sort(),
    roles: context.repoRoles,
    selectedRules: selected.map((x) => ({
      id: x.id,
      confidenceLevel: x.confidenceLevel,
      selectionMode: x.selectionMode,
      reasons: x.reasons.map((reason) => reason.message)
    })),
    skippedCount: recommendation?.skippedRules ?? 0,
    estimatedTokenReductionPct: recommendation?.estimatedTokenReductionPct ?? 0
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const lines = [
    "# Haus Context",
    `Task: ${payload.task}`,
    `Task intents: ${payload.taskIntents.join(", ") || "(none classified)"}`,
    `Roles: ${payload.roles.join(", ") || "unknown"}`,
    `Selected rules: ${payload.selectedRules.length}`,
    `Skipped rules: ${payload.skippedCount}`,
    `Estimated token reduction: ${payload.estimatedTokenReductionPct}%`,
    "Use minimal context.",
    ...payload.selectedRules.map((rule) => `- ${rule.id}: ${rule.reasons.join(", ")}`),
    summary
  ];
  const text = lines.join("\n");
  console.log(options.fromHook ? text.slice(0, 3000) : text);
}

/**
 * Deterministic task-context filter over `recommendation.json`. Never widens the
 * recommended set; only narrows it.
 *
 * Order:
 *   1. No task -> return entire recommended set unchanged.
 *   2. Task with classified intents -> keep rules whose computed intents
 *      overlap; baselines excluded.
 *   3. Task without classified intents (ambiguous) -> token-keyword fallback
 *      against id/tags/ecosystem; baselines excluded.
 *   4. Still empty -> non-baseline medium/high rules, capped at 8 to avoid
 *      "select everything" behavior.
 */
export function pickTaskRelevantRules(
  recommendation: Recommendation | undefined,
  task: string | undefined,
  taskIntents: Set<TaskIntent> = new Set()
): RecommendedRule[] {
  const recommended = recommendation?.recommended ?? [];
  if (!task) return recommended;

  if (taskIntents.size > 0) {
    const intentMatches = recommended.filter((rule) => {
      if (rule.selectionMode === "baseline") return false;
      const ruleIntents = computeRuleIntents(rule);
      if (ruleIntents.size === 0) return false;
      for (const ti of taskIntents) {
        if (ruleIntents.has(ti)) return true;
      }
      return false;
    });
    if (intentMatches.length > 0) return intentMatches;
  }

  const tokens = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  const tokenMatches = recommended.filter((rule) => {
    if (rule.selectionMode === "baseline") return false;
    const corpus = [
      rule.id,
      rule.ecosystem ?? "",
      ...(rule.tags ?? []),
      rule.reason ?? "",
      ...rule.reasons.map((r) => r.message)
    ]
      .join(" ")
      .toLowerCase();
    return tokens.some((token) => corpus.includes(token));
  });
  if (tokenMatches.length > 0) return tokenMatches;

  const taskWantsTesting = taskIntents.has("testing");
  const cappedMediumOrHigh = recommended.filter((rule) => {
    if (rule.selectionMode === "baseline") return false;
    if (rule.confidenceLevel === "low") return false;
    if (taskWantsTesting) return true;
    const ruleIntents = computeRuleIntents(rule);
    const isTestingOnly =
      ruleIntents.size > 0 && [...ruleIntents].every((i) => i === "testing");
    return !isTestingOnly;
  });
  return cappedMediumOrHigh.slice(0, 8);
}
