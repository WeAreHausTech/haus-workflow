/**
 * Orchestrates the explain flow for a single Recommendation: normalizes legacy
 * shapes and builds the structured ExplainRecommendation used by `haus explain`.
 */

import type { Recommendation } from '../types.js'

import { estimateContextTokens, tokenReductionPct } from './token-estimate.js'

/** Loose input shape that covers both current and legacy recommendation.json formats. */
type RecommendationLike = Partial<Recommendation> & {
  recommended?: Array<{
    id: string
    type?: string
    reason?: string
    reasons?: Array<{ message?: string; code?: string; signal?: string }>
    selectionMode?: 'baseline' | 'matched' | 'manual'
    install?: boolean
    tags?: string[]
    ecosystem?: string
    tokenEstimate?: number
    gates?: Array<{ name: string; passed: boolean }>
  }>
  skipped?: Array<{
    id: string
    reason?: string
    skipReasons?: Array<{ message?: string; code?: string; signal?: string }>
    gates?: Array<{ name: string; passed: boolean }>
  }>
}

/** Output shape for the `haus explain` command. */
type ExplainRecommendation = {
  selected: Array<{
    id: string
    selectionMode: 'baseline' | 'matched' | 'manual'
    reasons: string[]
  }>
  skipped: Array<{
    id: string
    reasons: string[]
    reasonDetails?: Array<{ code: string; message: string; signal?: string }>
  }>
  /**
   * Items skipped for exactly one failing gate — one signal away from qualifying.
   * Items failing two or more gates are excluded (they need more than one fix).
   */
  nearMiss: Array<{ id: string; missingGate: string; message: string }>
  stats: {
    selectedRules: number
    skippedRules: number
    estimatedTokenReductionPct: number
  }
}

/**
 * Coerce a legacy or current recommendation.json into the canonical Recommendation shape.
 * Tolerates legacy files that still carry score/confidence fields by ignoring them.
 */
export function normalizeRecommendation(input: RecommendationLike): Recommendation {
  const recommended = (input.recommended ?? []).map((item) => {
    const normalizedReasons = item.reasons?.map((reason) => ({
      code: reason.code ?? 'legacy-reason',
      message: reason.message ?? item.reason ?? 'legacy recommendation reason',
      ...(reason.signal ? { signal: reason.signal } : {}),
    })) ?? [{ code: 'legacy-reason', message: item.reason ?? 'legacy recommendation reason' }]
    return {
      id: item.id,
      type: item.type ?? 'skill',
      reason: item.reason ?? normalizedReasons.map((reason) => reason.message).join(', '),
      reasons: normalizedReasons,
      selectionMode: item.selectionMode ?? 'matched',
      install: item.install ?? true,
      tags: item.tags,
      ecosystem: item.ecosystem,
      tokenEstimate: item.tokenEstimate,
      ...(item.gates ? { gates: item.gates } : {}),
    }
  })

  const skipped = (input.skipped ?? []).map((item) => ({
    id: item.id,
    reason: item.reason ?? 'legacy skipped reason',
    skipReasons: item.skipReasons?.map((reason) => ({
      code: reason.code ?? 'legacy-skip-reason',
      message: reason.message ?? item.reason ?? 'legacy skipped reason',
      ...(reason.signal ? { signal: reason.signal } : {}),
    })) ?? [{ code: 'legacy-skip-reason', message: item.reason ?? 'legacy skipped reason' }],
    ...(item.gates ? { gates: item.gates } : {}),
  }))

  return {
    recommended,
    skipped,
    warnings: input.warnings ?? [],
    estimatedContextTokens:
      input.estimatedContextTokens ?? estimateContextTokens(recommended.length),
    selectedRules: input.selectedRules ?? recommended.length,
    skippedRules: input.skippedRules ?? skipped.length,
    estimatedTokenReductionPct:
      input.estimatedTokenReductionPct ?? tokenReductionPct(recommended.length, skipped.length),
  }
}

/**
 * Items skipped for exactly one failing gate — one signal away from qualifying.
 * Legacy recommendation.json files without a `gates` breakdown never surface here
 * (no per-gate data to determine "exactly one"), so the list is empty, not wrong.
 */
function buildNearMiss(skipped: Recommendation['skipped']): ExplainRecommendation['nearMiss'] {
  const nearMiss: ExplainRecommendation['nearMiss'] = []
  for (const item of skipped) {
    const gates = item.gates
    if (!gates) continue
    const failing = gates.filter((g) => !g.passed)
    if (failing.length !== 1) continue
    nearMiss.push({
      id: item.id,
      missingGate: failing[0]!.name,
      message: item.skipReasons[0]?.message ?? item.reason,
    })
  }
  return nearMiss
}

/** Build a structured explain output from a normalized Recommendation. */
export function buildRecommendationExplanation(
  recommendation: Recommendation,
): ExplainRecommendation {
  return {
    selected: recommendation.recommended.map((item) => ({
      id: item.id,
      selectionMode: item.selectionMode,
      reasons: item.reasons.map((reason) => reason.message),
    })),
    skipped: recommendation.skipped.map((item) => ({
      id: item.id,
      reasons: item.skipReasons.map((reason) => reason.message),
      reasonDetails: item.skipReasons.map((reason) => ({
        code: reason.code,
        message: reason.message,
        ...(reason.signal ? { signal: reason.signal } : {}),
      })),
    })),
    nearMiss: buildNearMiss(recommendation.skipped),
    stats: {
      selectedRules: recommendation.selectedRules,
      skippedRules: recommendation.skippedRules,
      estimatedTokenReductionPct: recommendation.estimatedTokenReductionPct,
    },
  }
}
