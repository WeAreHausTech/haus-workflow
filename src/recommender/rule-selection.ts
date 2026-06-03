/**
 * Task-scoped rule selection over `recommendation.json`: narrows the recommended set by
 * task intents, then trims to a token budget. Never widens the set.
 */

import type { Recommendation } from '../types.js'

import { type TaskIntent, computeRuleIntents } from './task-classification.js'

type RecommendedRule = Recommendation['recommended'][number]

/**
 * Default token budget for injected task context. Roughly 4–5 typical rules
 * (~2.6k tokens each). Tunable via the `tokenBudget` option. Set to 0/undefined to disable.
 */
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 12000

/**
 * Deterministic task-context filter over `recommendation.json`. Never widens the
 * recommended set; only narrows it. A token budget (if given) is applied last: when the
 * selected rules' cumulative tokenEstimate exceeds the budget, the lowest-scoring
 * non-baseline rules are dropped until it fits. Baselines are never dropped.
 *
 * Order:
 *   1. No task -> entire recommended set.
 *   2. Task with classified intents -> keep rules whose computed intents overlap; baselines excluded.
 *   3. Task without classified intents (ambiguous) -> token-keyword fallback against id/tags/ecosystem; baselines excluded.
 *   4. Still empty -> non-baseline medium/high rules, capped at 8 to avoid "select everything" behavior.
 *   5. Token-budget trim (if `opts.tokenBudget` set).
 */
export function pickTaskRelevantRules(
  recommendation: Recommendation | undefined,
  task: string | undefined,
  taskIntents: Set<TaskIntent> = new Set(),
  opts: { tokenBudget?: number } = {},
): RecommendedRule[] {
  const recommended = recommendation?.recommended ?? []
  return applyTokenBudget(selectRules(recommended, task, taskIntents), opts.tokenBudget)
}

/**
 * Drops the lowest-scoring non-baseline rules until cumulative tokenEstimate fits the
 * budget. Baseline rules are always kept (stack-agnostic, load-bearing). Input order is
 * preserved in the output. A falsy/≤0 budget is a no-op.
 */
function applyTokenBudget(rules: RecommendedRule[], budget?: number): RecommendedRule[] {
  if (!budget || budget <= 0) return rules
  const total = rules.reduce((sum, r) => sum + (r.tokenEstimate ?? 0), 0)
  if (total <= budget) return rules

  const keep = new Set<string>()
  let used = 0
  for (const r of rules) {
    if (r.selectionMode === 'baseline') {
      keep.add(r.id)
      used += r.tokenEstimate ?? 0
    }
  }
  const matched = rules
    .filter((r) => r.selectionMode !== 'baseline')
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  for (const r of matched) {
    const est = r.tokenEstimate ?? 0
    if (used + est <= budget) {
      keep.add(r.id)
      used += est
    }
  }
  return rules.filter((r) => keep.has(r.id))
}

/** The narrowing logic (no budget). See {@link pickTaskRelevantRules} for the order. */
function selectRules(
  recommended: RecommendedRule[],
  task: string | undefined,
  taskIntents: Set<TaskIntent>,
): RecommendedRule[] {
  if (!task) return recommended

  if (taskIntents.size > 0) {
    const intentMatches = recommended.filter((rule) => {
      if (rule.selectionMode === 'baseline') return false
      const ruleIntents = computeRuleIntents(rule)
      if (ruleIntents.size === 0) return false
      for (const ti of taskIntents) {
        if (ruleIntents.has(ti)) return true
      }
      return false
    })
    if (intentMatches.length > 0) return intentMatches
  }

  const tokens = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
  const tokenMatches = recommended.filter((rule) => {
    if (rule.selectionMode === 'baseline') return false
    const corpus = [
      rule.id,
      rule.ecosystem ?? '',
      ...(rule.tags ?? []),
      rule.reason ?? '',
      ...rule.reasons.map((r) => r.message),
    ]
      .join(' ')
      .toLowerCase()
    return tokens.some((token) => corpus.includes(token))
  })
  if (tokenMatches.length > 0) return tokenMatches

  const taskWantsTesting = taskIntents.has('testing')
  const cappedMediumOrHigh = recommended.filter((rule) => {
    if (rule.selectionMode === 'baseline') return false
    if (rule.confidenceLevel === 'low') return false
    if (taskWantsTesting) return true
    const ruleIntents = computeRuleIntents(rule)
    const isTestingOnly = ruleIntents.size > 0 && [...ruleIntents].every((i) => i === 'testing')
    return !isTestingOnly
  })
  return cappedMediumOrHigh.slice(0, 8)
}
