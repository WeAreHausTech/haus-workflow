/**
 * Pure scoring function: computes a numeric relevance score for one CatalogItem
 * against the detected project ContextMap.
 */

import type { CatalogItem, ContextMap } from "../types.js";

/**
 * Score a single catalog item against the project context.
 * Returns a score and the reasons that contributed to it.
 */
export function scoreCatalogItem(item: CatalogItem, context: ContextMap): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (item.repoRoles.some((r) => context.repoRoles.includes(r))) {
    score += 40;
    reasons.push("repo role match");
  }
  const stacks = new Set(
    Object.values(context.detectedStacks)
      .flat()
      .map((x) => x.toLowerCase()),
  );
  if (item.tags.some((t) => stacks.has(t.toLowerCase()))) {
    score += 30;
    reasons.push("stack match");
  }
  return { score, reasons };
}
