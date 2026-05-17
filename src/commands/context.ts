import { normalizeRecommendation } from "../recommender/explain-recommendation.js";
import { classifyTaskIntents, pickTaskRelevantRules, type TaskIntent } from "../recommender/task-intent.js";
import { readContextOrScan } from "../scanner/read-context.js";
import type { Recommendation } from "../types.js";
import { readJson, readText } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { hausPath } from "../utils/paths.js";

export async function runContext(options: {
  task?: string;
  fromHook?: boolean;
  json?: boolean;
  verbose?: boolean;
}): Promise<void> {
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
      reasons: x.reasons.map((reason) => reason.message),
      ...(options.verbose
        ? {
            scoreBreakdown: (x as { scoreBreakdown?: unknown }).scoreBreakdown,
          }
        : {}),
    })),
    skippedCount: recommendation?.skippedRules ?? 0,
    estimatedTokenReductionPct: recommendation?.estimatedTokenReductionPct ?? 0,
  };

  if (options.json) {
    log(JSON.stringify(payload, null, 2));
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
    ...payload.selectedRules.flatMap((rule) => {
      const reasonLine = `- ${rule.id}: ${rule.reasons.join(", ")}`;
      if (!options.verbose) return [reasonLine];
      const breakdown = (
        rule as {
          scoreBreakdown?: {
            bonuses?: Array<{ code: string; weight: number; signal?: string }>;
            penalties?: Array<{ code: string; penalty: number; signal?: string }>;
          };
        }
      ).scoreBreakdown;
      if (!breakdown) return [reasonLine];
      const bonuses = (breakdown.bonuses ?? []).map(
        (b) => `  + ${b.code}(+${b.weight})${b.signal ? ` [${b.signal}]` : ""}`,
      );
      const penalties = (breakdown.penalties ?? []).map(
        (p) => `  - ${p.code}(${p.penalty})${p.signal ? ` [${p.signal}]` : ""}`,
      );
      return [reasonLine, ...bonuses, ...penalties];
    }),
    summary,
  ];
  const text = lines.join("\n");
  log(options.fromHook ? text.slice(0, 3000) : text);
}
