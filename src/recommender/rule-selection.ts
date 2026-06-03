/**
 * Task-scoped rule selection over `recommendation.json`: narrows the recommended set by
 * task intents, then trims to a token budget. Never widens the set.
 */

import type { Recommendation } from '../types.js'

import { type TaskIntent, computeRuleIntents } from './task-classification.js'

type RecommendedRule = Recommendation['recommended'][number]

/** Count of positive eligibility signals (excludes the default-baseline marker). */
function evidenceCount(rule: RecommendedRule): number {
  return rule.reasons.filter((r) => r.code !== 'default-baseline').length
}

/** True when a rule's only eligibility signal is a repo-role match (weakest evidence). */
function isRoleOnly(rule: RecommendedRule): boolean {
  const codes = rule.reasons.map((r) => r.code).filter((c) => c !== 'default-baseline')
  return codes.length > 0 && codes.every((c) => c === 'repo-role-match')
}

/**
 * Default token budget for injected task context. Roughly 4–5 typical rules
 * (~2.6k tokens each). Tunable via the `tokenBudget` option. Set to 0/undefined to disable.
 */
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 12000

/**
 * Deterministic task-context filter over `recommendation.json`. Never widens the
 * recommended set; only narrows it. A token budget (if given) is applied last: when the
 * selected rules' cumulative tokenEstimate exceeds the budget, non-baseline rules with the
 * fewest match signals are dropped until it fits. Baselines are never dropped.
 *
 * Order:
 *   1. No task -> entire recommended set.
 *   2. Task with classified intents -> keep rules whose computed intents overlap; baselines excluded.
 *   3. Task without classified intents (ambiguous) -> token-keyword fallback against id/tags/ecosystem; baselines excluded.
 *   4. Still empty -> non-baseline rules with real evidence (role-only bleed dropped), capped at 8 to avoid "select everything" behavior.
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
 * Drops the lowest-evidence non-baseline rules until cumulative tokenEstimate fits the
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
    .sort((a, b) => evidenceCount(b) - evidenceCount(a) || a.id.localeCompare(b.id))
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
  const capped = recommended.filter((rule) => {
    if (rule.selectionMode === 'baseline') return false
    // Drop weakest evidence (role-only bleed) from the ambiguous fallback set.
    if (isRoleOnly(rule)) return false
    if (taskWantsTesting) return true
    const ruleIntents = computeRuleIntents(rule)
    const isTestingOnly = ruleIntents.size > 0 && [...ruleIntents].every((i) => i === 'testing')
    return !isTestingOnly
  })
  return capped.slice(0, 8)
}
