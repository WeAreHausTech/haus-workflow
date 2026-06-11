/** Shared token estimate helpers for recommendation output. */

const TOKENS_PER_ITEM = 320

export function estimateContextTokens(selectedCount: number): number {
  return selectedCount * TOKENS_PER_ITEM
}

export function tokenReductionPct(selected: number, skipped: number): number {
  const total = selected + skipped
  if (total === 0) return 0
  return Math.max(0, Math.round((skipped / total) * 100))
}
