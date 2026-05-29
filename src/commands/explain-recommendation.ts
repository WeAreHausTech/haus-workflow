/** `haus explain-recommendation` — prints a human-readable or JSON breakdown of the current recommendation. */
import { formatRecommendationHuman } from '../recommender/explain-formatters.js'
import {
  buildRecommendationExplanation,
  normalizeRecommendation,
} from '../recommender/explain-recommendation.js'
import type { Recommendation } from '../types.js'
import { readJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { hausPath } from '../utils/paths.js'

/** Reads recommendation.json and outputs a human-readable or JSON explanation of each scored item. */
export async function runExplainRecommendation(options: { json?: boolean }): Promise<void> {
  const root = process.cwd()
  const rec = await readJson<Recommendation>(hausPath(root, 'recommendation.json'))
  if (!rec) {
    throw new Error('No recommendation found. Run `haus recommend` first.')
  }
  const normalized = normalizeRecommendation(rec)
  if (options.json) {
    const explanation = buildRecommendationExplanation(normalized)
    log(JSON.stringify(explanation, null, 2))
    return
  }
  log(formatRecommendationHuman(normalized))
}
