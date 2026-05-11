import { readJson, readText } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { readContextOrScan } from "../scanner/read-context.js";
import type { Recommendation } from "../types.js";

export async function runContext(options: { task?: string; fromHook?: boolean; json?: boolean }): Promise<void> {
  const root = process.cwd();
  const context = await readContextOrScan(root);
  const summary = (await readText(hausPath(root, "repo-summary.md"))) ?? "";
  const recommendation = await readJson<Recommendation>(hausPath(root, "recommendation.json"));
  const selected = pickTaskRelevantRules(recommendation, options.task);
  const payload = {
    task: options.task ?? "not provided",
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

function pickTaskRelevantRules(recommendation: Recommendation | undefined, task: string | undefined) {
  const recommended = recommendation?.recommended ?? [];
  const mediumOrHigh = recommended.filter((item) => item.confidenceLevel !== "low");
  if (!task) return recommended;

  const terms = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
  const filtered = recommended.filter((item) => {
    const corpus = `${item.id} ${item.reason} ${item.reasons.map((r) => r.message).join(" ")}`.toLowerCase();
    return terms.some((term) => corpus.includes(term));
  });
  if (filtered.length > 0) {
    const filteredMediumOrHigh = filtered.filter((item) => item.confidenceLevel !== "low");
    return filteredMediumOrHigh.length > 0 ? filteredMediumOrHigh : filtered;
  }
  return mediumOrHigh;
}
