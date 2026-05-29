/** Shared types used across the recommender pipeline. */

/** Score result for a single catalog item, produced by scoreCatalogItem. */
export type RecommendationScore = {
  /** Catalog item identifier. */
  id: string
  /** Numeric score — higher means stronger signal match. */
  score: number
  /** Human-readable reasons that contributed to the score. */
  reasons: string[]
}
