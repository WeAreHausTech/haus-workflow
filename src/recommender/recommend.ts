import { loadCatalog } from "../catalog/load-catalog.js";
import type { ContextMap, Recommendation } from "../types.js";

const UNSUPPORTED = ["python", "django", "go", "rust", "java", "spring", "kotlin", "swift", "android", "flutter", "dart", "c++", "perl", "defi", "trading"];

export async function recommend(root: string, context: ContextMap): Promise<Recommendation> {
  const items = await loadCatalog(root);
  const stack = new Set([...context.repoRoles, ...Object.values(context.detectedStacks).flat()].map((x) => x.toLowerCase()));
  const recommended: Recommendation["recommended"] = [];
  const skipped: Recommendation["skipped"] = [];

  for (const item of items) {
    const blob = `${item.id} ${item.tags.join(" ")}`.toLowerCase();
    if (UNSUPPORTED.some((x) => blob.includes(x))) {
      skipped.push({ id: item.id, reason: "Unsupported stack policy" });
      continue;
    }
    let score = 0;
    if (item.repoRoles.some((r) => context.repoRoles.includes(r))) score += 40;
    if (item.tags.some((t) => stack.has(t.toLowerCase()))) score += 30;
    if (item.tags.includes(context.packageManager)) score += 10;
    if (score > 0) {
      recommended.push({
        id: item.id,
        type: item.type,
        reason: `score=${score}`,
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
