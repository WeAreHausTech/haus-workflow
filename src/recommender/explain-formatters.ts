import type { Recommendation } from "../types.js";

import { computeRuleIntents, type TaskIntent } from "./task-intent.js";

type RecommendedRule = Recommendation["recommended"][number];

const TASK_SIGNAL_TOKENS = [
  "vendure",
  "nestjs",
  "nextjs",
  "next.js",
  "laravel",
  "nova",
  "wordpress",
  "bedrock",
  "react",
  "vue",
  "tanstack",
  "tailwind",
  "shadcn",
  "radix",
  "graphql",
  "trpc",
  "storybook",
  "playwright",
  "cypress",
  "vitest",
  "phpunit",
  "nx",
  "turbo",
  "yarn",
  "pnpm",
  "postgres",
  "mariadb",
  "mssql",
  "elasticsearch",
  "oidc",
  "oauth",
  "bankid",
  "jwt",
];

export function extractTaskSignals(task: string | undefined): string[] {
  if (!task) return [];
  const lc = task.toLowerCase();
  const found = new Set<string>();
  for (const token of TASK_SIGNAL_TOKENS) {
    if (lc.includes(token)) found.add(token);
  }
  return [...found].sort();
}

function formatReasonWithSignal(reason: { message: string; signal?: string }): string {
  return reason.signal ? `${reason.message} (${reason.signal})` : reason.message;
}

export function formatRecommendationHuman(rec: Recommendation): string {
  const lines: string[] = [];
  lines.push("Recommendation explanation");
  lines.push(`  mode: ${rec.mode}`);
  lines.push(
    `  selected: ${rec.selectedRules} | skipped: ${rec.skippedRules} | estimated token reduction: ${rec.estimatedTokenReductionPct}%`,
  );
  if (rec.warnings.length > 0) {
    lines.push("  warnings:");
    for (const warning of rec.warnings) lines.push(`    - ${warning}`);
  }
  lines.push("");
  lines.push("Selected");
  if (rec.recommended.length === 0) lines.push("  (none)");
  for (const item of rec.recommended) {
    lines.push(`- ${item.id}`);
    lines.push(`    confidence: ${item.confidenceLevel} (${item.confidence.toFixed(2)})`);
    lines.push(`    selection: ${item.selectionMode}`);
    lines.push("    why:");
    for (const reason of item.reasons) lines.push(`      - ${formatReasonWithSignal(reason)}`);
  }
  lines.push("");
  lines.push("Skipped");
  if (rec.skipped.length === 0) lines.push("  (none)");
  for (const item of rec.skipped) {
    lines.push(`- ${item.id}`);
    lines.push("    why:");
    for (const reason of item.skipReasons) lines.push(`      - ${formatReasonWithSignal(reason)}`);
  }
  return lines.join("\n");
}

type ExclusionReason = "baseline" | "intent-mismatch" | "no-metadata";

export type TaskExcludedRule = {
  id: string;
  confidenceLevel: "low" | "medium" | "high";
  selectionMode: "baseline" | "matched";
  ruleIntents: TaskIntent[];
  exclusionReason: ExclusionReason;
  explanation: string;
};

export type TaskIncludedRule = {
  id: string;
  confidenceLevel: "low" | "medium" | "high";
  selectionMode: "baseline" | "matched";
  ruleIntents: TaskIntent[];
  inclusionReason: string;
  reasons: string[];
};

export type ContextExplanation = {
  selected: Array<{
    id: string;
    confidence: number;
    confidenceLevel: "low" | "medium" | "high";
    selectionMode: "baseline" | "matched";
    reasons: string[];
  }>;
  skipped: Array<{ id: string; reasons: string[] }>;
  stats: {
    selectedRules: number;
    skippedRules: number;
    estimatedTokenReductionPct: number;
  };
  task?: string;
  taskIntents?: TaskIntent[];
  taskSignals?: string[];
  repoSignals?: string[];
  includedInTask?: TaskIncludedRule[];
  excludedFromTask?: TaskExcludedRule[];
};

function collectRepoSignals(rules: RecommendedRule[]): string[] {
  const signals = new Set<string>();
  for (const rule of rules) {
    if (rule.ecosystem) signals.add(rule.ecosystem);
    for (const tag of rule.tags ?? []) signals.add(tag);
  }
  return [...signals].sort();
}

function pickInclusionReason(
  rule: RecommendedRule,
  taskIntents: Set<TaskIntent>,
  ruleIntents: Set<TaskIntent>,
): string {
  const overlap = [...taskIntents].filter((intent) => ruleIntents.has(intent));
  if (overlap.length > 0) {
    return `rule intents [${[...ruleIntents].sort().join(", ")}] match task intents [${[...overlap].sort().join(", ")}]`;
  }
  return `kept via keyword fallback on rule id/tags`;
}

function pickExclusionReason(
  rule: RecommendedRule,
  taskIntents: Set<TaskIntent>,
  ruleIntents: Set<TaskIntent>,
): { code: ExclusionReason; explanation: string } {
  if (rule.selectionMode === "baseline") {
    return {
      code: "baseline",
      explanation: "baseline rules are excluded from task-scoped context",
    };
  }
  if (ruleIntents.size === 0) {
    return {
      code: "no-metadata",
      explanation: "no tags/ecosystem available for task-intent routing",
    };
  }
  if (taskIntents.size === 0) {
    return {
      code: "intent-mismatch",
      explanation: "task intents could not be classified; rule excluded by ambiguous-fallback",
    };
  }
  return {
    code: "intent-mismatch",
    explanation: `rule intents [${[...ruleIntents].sort().join(", ")}] do not overlap task intents [${[...taskIntents].sort().join(", ")}]`,
  };
}

export function buildContextExplanation(
  rec: Recommendation,
  task: string | undefined,
  taskIntents: Set<TaskIntent>,
  includedIds: Set<string>,
): ContextExplanation {
  const selected = rec.recommended.map((item) => ({
    id: item.id,
    confidence: item.confidence,
    confidenceLevel: item.confidenceLevel,
    selectionMode: item.selectionMode,
    reasons: item.reasons.map((reason) => reason.message),
  }));
  const skipped = rec.skipped.map((item) => ({
    id: item.id,
    reasons: item.skipReasons.map((reason) => reason.message),
  }));
  const stats = {
    selectedRules: rec.selectedRules,
    skippedRules: rec.skippedRules,
    estimatedTokenReductionPct: rec.estimatedTokenReductionPct,
  };
  if (!task) return { selected, skipped, stats };

  const includedInTask: TaskIncludedRule[] = [];
  const excludedFromTask: TaskExcludedRule[] = [];
  const includedRules: RecommendedRule[] = [];
  for (const rule of rec.recommended) {
    const ruleIntents = computeRuleIntents(rule);
    if (includedIds.has(rule.id)) {
      includedRules.push(rule);
      includedInTask.push({
        id: rule.id,
        confidenceLevel: rule.confidenceLevel,
        selectionMode: rule.selectionMode,
        ruleIntents: [...ruleIntents].sort(),
        inclusionReason: pickInclusionReason(rule, taskIntents, ruleIntents),
        reasons: rule.reasons.map(formatReasonWithSignal),
      });
    } else {
      const { code, explanation } = pickExclusionReason(rule, taskIntents, ruleIntents);
      excludedFromTask.push({
        id: rule.id,
        confidenceLevel: rule.confidenceLevel,
        selectionMode: rule.selectionMode,
        ruleIntents: [...ruleIntents].sort(),
        exclusionReason: code,
        explanation,
      });
    }
  }
  return {
    selected,
    skipped,
    stats,
    task,
    taskIntents: [...taskIntents].sort(),
    taskSignals: extractTaskSignals(task),
    repoSignals: collectRepoSignals(includedRules),
    includedInTask,
    excludedFromTask,
  };
}

export function formatContextHuman(
  task: string | undefined,
  explanation: ContextExplanation,
  options: { stats?: boolean } = {},
): string {
  const lines: string[] = [];
  if (task) {
    lines.push(`Task: ${task}`);
    lines.push("Task intents:");
    if (explanation.taskIntents && explanation.taskIntents.length > 0) {
      for (const intent of explanation.taskIntents) lines.push(`- ${intent}`);
    } else {
      lines.push("- (none classified; ambiguous-fallback in effect)");
    }
    if (explanation.taskSignals && explanation.taskSignals.length > 0) {
      lines.push("Task signals (from task text):");
      for (const signal of explanation.taskSignals) lines.push(`- ${signal}`);
    }
    if (explanation.repoSignals && explanation.repoSignals.length > 0) {
      lines.push("Repo signals matched (from included rules):");
      for (const signal of explanation.repoSignals) lines.push(`- ${signal}`);
    }
    lines.push("");
    lines.push("Included in task context");
    if (!explanation.includedInTask || explanation.includedInTask.length === 0) {
      lines.push("- (none)");
    } else {
      for (const item of explanation.includedInTask) {
        lines.push(`- ${item.id}`);
        lines.push(`    confidence: ${item.confidenceLevel}`);
        lines.push(`    selection: ${item.selectionMode}`);
        lines.push(`    intents: ${item.ruleIntents.length ? item.ruleIntents.join(", ") : "(none)"}`);
        lines.push(`    because: ${item.inclusionReason}`);
        if (item.reasons.length > 0) {
          lines.push("    why selected by recommender:");
          for (const reason of item.reasons) lines.push(`      - ${reason}`);
        }
      }
    }
    lines.push("");
    lines.push("Excluded from task context");
    if (!explanation.excludedFromTask || explanation.excludedFromTask.length === 0) {
      lines.push("- (none)");
    } else {
      for (const item of explanation.excludedFromTask) {
        lines.push(`- ${item.id}`);
        lines.push(`    intents: ${item.ruleIntents.length ? item.ruleIntents.join(", ") : "(none)"}`);
        lines.push(`    why excluded: ${item.explanation}`);
      }
    }
  } else {
    lines.push("Selected");
    if (explanation.selected.length === 0) lines.push("  (none)");
    for (const item of explanation.selected) {
      lines.push(`- ${item.id}`);
      lines.push(`    confidence: ${item.confidenceLevel} (${item.confidence.toFixed(2)})`);
      lines.push(`    selection: ${item.selectionMode}`);
      lines.push("    why:");
      for (const reason of item.reasons) lines.push(`      - ${reason}`);
    }
    lines.push("");
    lines.push("Skipped");
    if (explanation.skipped.length === 0) lines.push("  (none)");
    for (const item of explanation.skipped) {
      lines.push(`- ${item.id}`);
      lines.push("    why:");
      for (const reason of item.reasons) lines.push(`      - ${reason}`);
    }
  }
  if (options.stats) {
    lines.push("");
    lines.push("Stats");
    lines.push(`  selected rules: ${explanation.stats.selectedRules}`);
    lines.push(`  skipped rules: ${explanation.stats.skippedRules}`);
    lines.push(`  estimated token reduction: ${explanation.stats.estimatedTokenReductionPct}%`);
  }
  return lines.join("\n");
}

export type { TaskIntent };
