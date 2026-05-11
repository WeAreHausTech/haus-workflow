import type { Recommendation } from "../types.js";

type ExplainRecommendation = {
  selected: Array<{
    id: string;
    confidence: number;
    confidenceLevel: "low" | "medium" | "high";
    reasons: string[];
  }>;
  skipped: Array<{
    id: string;
    reasons: string[];
  }>;
  stats: {
    selectedRules: number;
    skippedRules: number;
    estimatedTokenReductionPct: number;
  };
};

export function buildRecommendationExplanation(recommendation: Recommendation): ExplainRecommendation {
  return {
    selected: recommendation.recommended.map((item) => ({
      id: item.id,
      confidence: item.confidence,
      confidenceLevel: item.confidenceLevel,
      reasons: item.reasons.map((reason) => reason.message)
    })),
    skipped: recommendation.skipped.map((item) => ({
      id: item.id,
      reasons: item.skipReasons.map((reason) => reason.message)
    })),
    stats: {
      selectedRules: recommendation.selectedRules,
      skippedRules: recommendation.skippedRules,
      estimatedTokenReductionPct: recommendation.estimatedTokenReductionPct
    }
  };
}
