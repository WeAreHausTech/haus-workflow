/**
 * Orchestrates the explain flow for a single Recommendation: normalizes legacy
 * shapes and builds the structured ExplainRecommendation used by `haus explain`.
 */

import type { Recommendation } from '../types.js'

/** Loose input shape that covers both current and legacy recommendation.json formats. */
type RecommendationLike = Partial<Recommendation> & {
  recommended?: Array<{
    id: string
    type?: string
    reason?: string
    reasons?: Array<{ message?: string; code?: string; weight?: number; signal?: string }>
    confidence?: number
    confidenceLevel?: 'low' | 'medium' | 'high'
    selectionMode?: 'baseline' | 'matched'
    install?: boolean
    score?: number
    tags?: string[]
    ecosystem?: string
    tokenEstimate?: number
  }>
  skipped?: Array<{
    id: string
    reason?: string
    skipReasons?: Array<{ message?: string; code?: string; penalty?: number; signal?: string }>
  }>
}

/** Output shape for the `haus explain` command. */
type ExplainRecommendation = {
  selected: Array<{
    id: string
    confidence: number
    confidenceLevel: 'low' | 'medium' | 'high'
    selectionMode: 'baseline' | 'matched'
    reasons: string[]
  }>
  skipped: Array<{
    id: string
    reasons: string[]
    reasonDetails?: Array<{ code: string; message: string; penalty: number; signal?: string }>
  }>
  stats: {
    selectedRules: number
    skippedRules: number
    estimatedTokenReductionPct: number
  }
}

/**
 * Coerce a legacy or current recommendation.json into the canonical Recommendation shape.
 * Fills in missing fields with safe defaults so downstream code can assume a consistent schema.
 */
export function normalizeRecommendation(input: RecommendationLike): Recommendation {
  const recommended = (input.recommended ?? []).map((item) => {
    const normalizedReasons = item.reasons?.map((reason) => ({
      code: reason.code ?? 'legacy-reason',
      message: reason.message ?? item.reason ?? 'legacy recommendation reason',
      weight: reason.weight ?? 0,
      ...(reason.signal ? { signal: reason.signal } : {}),
    })) ?? [
      { code: 'legacy-reason', message: item.reason ?? 'legacy recommendation reason', weight: 0 },
    ]
    const confidence = item.confidence ?? 0
    return {
      id: item.id,
      type: item.type ?? 'skill',
      reason: item.reason ?? normalizedReasons.map((reason) => reason.message).join(', '),
      reasons: normalizedReasons,
      confidence,
      confidenceLevel:
        item.confidenceLevel ??
        (confidence >= 0.75 ? 'high' : confidence >= 0.4 ? 'medium' : 'low'),
      selectionMode: item.selectionMode ?? 'matched',
      install: item.install ?? true,
      score: item.score ?? 0,
      scoreBreakdown: {
        bonuses: normalizedReasons,
        penalties: [],
        finalScore: item.score ?? 0,
      },
      tags: item.tags,
      ecosystem: item.ecosystem,
      tokenEstimate: item.tokenEstimate,
    }
  })

  const skipped = (input.skipped ?? []).map((item) => ({
    id: item.id,
    reason: item.reason ?? 'legacy skipped reason',
    skipReasons: item.skipReasons?.map((reason) => ({
      code: reason.code ?? 'legacy-skip-reason',
      message: reason.message ?? item.reason ?? 'legacy skipped reason',
      penalty: reason.penalty ?? 0,
      ...(reason.signal ? { signal: reason.signal } : {}),
    })) ?? [
      {
        code: 'legacy-skip-reason',
        message: item.reason ?? 'legacy skipped reason',
        penalty: 0,
      },
    ],
  }))

  return {
    mode: input.mode === 'guided' ? 'guided' : 'fast',
    recommended,
    skipped,
    warnings: input.warnings ?? [],
    estimatedContextTokens: input.estimatedContextTokens ?? recommended.length * 320,
    selectedRules: input.selectedRules ?? recommended.length,
    skippedRules: input.skippedRules ?? skipped.length,
    estimatedTokenReductionPct:
      input.estimatedTokenReductionPct ??
      Math.max(
        0,
        Math.round((skipped.length / Math.max(recommended.length + skipped.length, 1)) * 100),
      ),
  }
}

/** Build a structured explain output from a normalized Recommendation. */
export function buildRecommendationExplanation(
  recommendation: Recommendation,
): ExplainRecommendation {
  return {
    selected: recommendation.recommended.map((item) => ({
      id: item.id,
      confidence: item.confidence,
      confidenceLevel: item.confidenceLevel,
      selectionMode: item.selectionMode,
      reasons: item.reasons.map((reason) => reason.message),
    })),
    skipped: recommendation.skipped.map((item) => ({
      id: item.id,
      reasons: item.skipReasons.map((reason) => reason.message),
      reasonDetails: item.skipReasons.map((reason) => ({
        code: reason.code,
        message: reason.message,
        penalty: reason.penalty,
        ...(reason.signal ? { signal: reason.signal } : {}),
      })),
    })),
    stats: {
      selectedRules: recommendation.selectedRules,
      skippedRules: recommendation.skippedRules,
      estimatedTokenReductionPct: recommendation.estimatedTokenReductionPct,
    },
  }
}
