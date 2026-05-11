import { loadCatalog } from "../catalog/load-catalog.js";
import { readJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { execSync } from "node:child_process";
import type { ContextMap, Recommendation } from "../types.js";

const UNSUPPORTED = ["python", "django", "go", "rust", "java", "spring", "kotlin", "swift", "android", "flutter", "dart", "c++", "perl", "defi", "trading"];
const SENSITIVE = [".env", "secrets", "certs", "customer-data", "exports", ".pem", ".key"];

export async function recommend(root: string, context: ContextMap): Promise<Recommendation> {
  const items = await loadCatalog(root);
  const setupAnswers = (await readJson<Record<string, string>>(hausPath(root, "setup-answers.json"))) ?? {};
  const sources = (await readJson<{ items?: Array<{ id: string; status?: string }> }>(hausPath(root, "sources-report.json"))) ?? {};
  const stack = new Set([...context.repoRoles, ...Object.values(context.detectedStacks).flat()].map((x) => x.toLowerCase()));
  const recommended: Recommendation["recommended"] = [];
  const skipped: Recommendation["skipped"] = [];
  const goals = Object.values(setupAnswers).join(" ").toLowerCase();
  const sourceTrust = new Map((sources.items ?? []).map((x) => [x.id, x.status ?? "candidate"]));
  const changedFiles = readChangedFiles(root);
  const securityRiskCount = context.securityRisks?.length ?? 0;

  for (const item of items) {
    const blob = `${item.id} ${item.tags.join(" ")}`.toLowerCase();
    if (UNSUPPORTED.some((x) => blob.includes(x))) {
      skipped.push({
        id: item.id,
        reason: "Unsupported stack policy",
        skipReasons: [{ code: "unsupported-policy", message: "Unsupported stack policy", penalty: 100 }]
      });
      continue;
    }
    if (item.id === "haus.nx21-monorepo-patterns" && !context.repoRoles.includes("nx-monorepo")) {
      skipped.push({
        id: item.id,
        reason: "Required role missing: nx-monorepo",
        skipReasons: [{ code: "required-role-missing", message: "Required role missing: nx-monorepo", penalty: 100 }]
      });
      continue;
    }
    if (item.id === "haus.turbo-monorepo-patterns" && !context.repoRoles.includes("turbo-monorepo")) {
      skipped.push({
        id: item.id,
        reason: "Required role missing: turbo-monorepo",
        skipReasons: [{ code: "required-role-missing", message: "Required role missing: turbo-monorepo", penalty: 100 }]
      });
      continue;
    }

    let score = 0;
    const reasons: Recommendation["recommended"][number]["reasons"] = [];
    const skipReasons: Recommendation["skipped"][number]["skipReasons"] = [];
    const pushReason = (code: string, message: string, weight: number) => {
      score += weight;
      reasons.push({ code, message, weight });
    };
    const pushSkipReason = (code: string, message: string, penalty: number) => {
      skipReasons.push({ code, message, penalty });
    };

    if (item.default === true) {
      pushReason("default-baseline", "catalog default baseline", 25);
    }
    if (item.repoRoles.some((r) => context.repoRoles.includes(r))) pushReason("repo-role-match", "repo role match", 40);
    if (item.tags.some((t) => stack.has(t.toLowerCase()))) {
      pushReason("stack-match", "stack/dependency match", 30);
    }
    if (item.tags.some((t) => goals.includes(t) || goals.includes(t.replace(/-/g, " ")))) {
      pushReason("goal-match", "guided goal match", 15);
    }
    if (item.tags.includes(context.packageManager) || item.tags.includes(`${context.packageManager}4`) || item.tags.includes(`${context.packageManager}89`)) {
      pushReason("package-manager-match", "package manager match", 10);
    }
    if (item.tags.some((t) => context.warnings.join(" ").toLowerCase().includes(t.toLowerCase()))) {
      pushReason("config-signal-match", "config signal match", 20);
    }
    if (changedFiles.some((f) => f.includes(item.id.split(".").pop() ?? ""))) {
      pushReason("changed-file-match", "changed file match", 10);
    }
    if (SENSITIVE.some((x) => blob.includes(x))) {
      score -= 100;
      pushSkipReason("sensitive-policy", "Sensitive content policy block", 100);
    }
    const trust = sourceTrust.get(item.source);
    if (trust === "candidate" || trust === "rejected") {
      score -= 100;
      pushSkipReason("source-trust", "Source trust policy block", 100);
    }
    if (item.source && item.source !== "haus" && trust !== "approved") {
      score -= 100;
      pushSkipReason("source-approval", "Source not approved", 100);
    }
    if (securityRiskCount > 0 && (item.tags.includes("security") || item.id.includes("security"))) {
      score -= 20;
      pushSkipReason("security-risk-penalty", "Security-tagged item penalized by active risk signals", 20);
    }

    const minScore = item.default === true ? 1 : 40;
    if (score >= minScore) {
      const confidence = Math.min(0.99, Number((score / 100).toFixed(2)));
      recommended.push({
        id: item.id,
        type: item.type,
        reason: reasons.length ? reasons.map((x) => x.message).join(", ") : `score=${score}`,
        reasons,
        confidence,
        confidenceLevel: toConfidenceLevel(confidence),
        install: true,
        score,
        scoreBreakdown: {
          bonuses: reasons,
          penalties: skipReasons,
          finalScore: score
        }
      });
    } else {
      if (skipReasons.length === 0) {
        pushSkipReason("no-role-stack-match", "No role/stack match", 0);
      }
      skipped.push({ id: item.id, reason: skipReasons[0].message, skipReasons });
    }
  }

  recommended.sort((a, b) => a.id.localeCompare(b.id));
  skipped.sort((a, b) => a.id.localeCompare(b.id));
  const estimatedContextTokens = recommended.length * 320;
  const selectedRules = recommended.length;
  const skippedRules = skipped.length;
  const estimatedTokenReductionPct = Math.max(0, Math.round((skippedRules / Math.max(selectedRules + skippedRules, 1)) * 100));
  return {
    mode: context.mode,
    recommended,
    skipped,
    warnings: mergeRecommendationWarnings(context),
    estimatedContextTokens,
    selectedRules,
    skippedRules,
    estimatedTokenReductionPct
  };
}

function mergeRecommendationWarnings(context: ContextMap): string[] {
  const riskLines =
    (context.securityRisks?.length ?? 0) > 0
      ? [`Scan reported security signals: ${context.securityRisks.join("; ")}`]
      : [];
  return [...new Set([...context.warnings, ...riskLines])];
}

function readChangedFiles(root: string): string[] {
  if (process.env.HAUS_DISABLE_GIT_SIGNALS === "1") return [];
  try {
    const raw = execSync("git diff --name-only", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
    return raw.split("\n").map((x) => x.trim()).filter(Boolean).sort();
  } catch {
    return [];
  }
}

function toConfidenceLevel(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}
