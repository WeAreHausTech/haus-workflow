import { loadCatalog } from "../catalog/load-catalog.js";
import { readJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
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

  for (const item of items) {
    const blob = `${item.id} ${item.tags.join(" ")}`.toLowerCase();
    if (UNSUPPORTED.some((x) => blob.includes(x))) {
      skipped.push({ id: item.id, reason: "Unsupported stack policy" });
      continue;
    }

    let score = 0;
    const reasons: string[] = [];
    if (item.repoRoles.some((r) => context.repoRoles.includes(r))) score += 40;
    if (item.tags.some((t) => stack.has(t.toLowerCase()))) {
      score += 30;
      reasons.push("stack/dependency match");
    }
    if (item.tags.some((t) => goals.includes(t) || goals.includes(t.replace(/-/g, " ")))) {
      score += 15;
      reasons.push("guided goal match");
    }
    if (item.tags.includes(context.packageManager) || item.tags.includes(`${context.packageManager}4`) || item.tags.includes(`${context.packageManager}89`)) {
      score += 10;
      reasons.push("package manager match");
    }
    if (item.tags.some((t) => context.warnings.join(" ").toLowerCase().includes(t.toLowerCase()))) {
      score += 20;
      reasons.push("config signal match");
    }
    if (SENSITIVE.some((x) => blob.includes(x))) score -= 100;
    const trust = sourceTrust.get(item.id);
    if (trust === "candidate" || trust === "rejected") score -= 100;

    if (score > 0) {
      recommended.push({
        id: item.id,
        type: item.type,
        reason: reasons.length ? reasons.join(", ") : `score=${score}`,
        confidence: Math.min(0.99, Number((score / 100).toFixed(2))),
        install: true
      });
    } else {
      skipped.push({ id: item.id, reason: "No role/stack match" });
    }
  }

  const estimatedContextTokens = recommended.length * 320;
  return { mode: context.mode, recommended, skipped, warnings: context.warnings, estimatedContextTokens };
}
