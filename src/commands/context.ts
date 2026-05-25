import { isHookEnabled } from "../claude/load-hooks-config.js";
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
  // Hook-mode short-circuit: per the P2 audit, this hook is gated default-off.
  // Opt in via `.haus-ai/config.json` -> `hooks.context.enabled = true`.
  if (options.fromHook && !(await isHookEnabled(root, "context"))) {
    return;
  }
  const context = await readContextOrScan(root);
  const summary = (await readText(hausPath(root, "repo-summary.md"))) ?? "";
  const recommendationRaw = await readJson<Recommendation>(hausPath(root, "recommendation.json"));
  const recommendation = recommendationRaw ? normalizeRecommendation(recommendationRaw) : undefined;
  // Build a lookup from the raw recommended items so --verbose can surface the
  // original scoreBreakdown (including penalties), which normalizeRecommendation
  // strips when reconstructing from legacy format.
  const rawBreakdownById = new Map(
    (recommendationRaw?.recommended ?? []).map((item) => [item.id, item.scoreBreakdown]),
  );
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
      ...(options.verbose ? { scoreBreakdown: rawBreakdownById.get(x.id) } : {}),
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
      const breakdown = rawBreakdownById.get(rule.id);
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
