/**
 * Formats a Recommendation into human-readable explain output for `haus explain`.
 */

import type { Recommendation } from '../types.js'

import type { ExplainRecommendation } from './explain-recommendation.js'

function formatReasonWithSignal(reason: { message: string; signal?: string }): string {
  return reason.signal ? `${reason.message} (${reason.signal})` : reason.message
}

/**
 * Format a full Recommendation as a human-readable string for terminal output.
 * `nearMiss` (from `buildRecommendationExplanation`) is optional so callers that only
 * have a bare Recommendation (no gates breakdown, e.g. legacy files) still format cleanly.
 */
export function formatRecommendationHuman(
  rec: Recommendation,
  nearMiss: ExplainRecommendation['nearMiss'] = [],
): string {
  const lines: string[] = []
  lines.push('Recommendation explanation')
  lines.push(
    `  selected: ${rec.selectedRules} | skipped: ${rec.skippedRules} | estimated token reduction: ${rec.estimatedTokenReductionPct}%`,
  )
  if (rec.warnings.length > 0) {
    lines.push('  warnings:')
    for (const warning of rec.warnings) lines.push(`    - ${warning}`)
  }
  lines.push('')
  lines.push('Selected')
  if (rec.recommended.length === 0) lines.push('  (none)')
  for (const item of rec.recommended) {
    lines.push(`- ${item.id}`)
    lines.push(`    selection: ${item.selectionMode}`)
    lines.push('    why:')
    for (const reason of item.reasons) lines.push(`      - ${formatReasonWithSignal(reason)}`)
  }
  lines.push('')
  lines.push('Skipped')
  if (rec.skipped.length === 0) lines.push('  (none)')
  for (const item of rec.skipped) {
    lines.push(`- ${item.id}`)
    lines.push('    why:')
    for (const reason of item.skipReasons) lines.push(`      - ${formatReasonWithSignal(reason)}`)
  }
  if (nearMiss.length > 0) {
    lines.push('')
    lines.push('Near misses (one gate away)')
    for (const item of nearMiss) {
      lines.push(`- ${item.id}`)
      lines.push(`    missing gate: ${item.missingGate}`)
      lines.push(`    ${item.message}`)
    }
  }
  return lines.join('\n')
}
