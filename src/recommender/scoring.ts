/** Scoring primitives for the recommender: signal types, confidence derivation, git change signal. */

import { runGit } from '../utils/exec.js'

/** A positive scoring signal with its reason code, message, weight and optional signal tag. */
export type ReasonHit = {
  code: string
  message: string
  weight: number
  signal?: string
}

/** A negative scoring signal (penalty) that can reduce or eliminate a recommendation. */
export type SkipHit = {
  code: string
  message: string
  penalty: number
  signal?: string
}

/** Derive a confidence level (low/medium/high) from scoring signals and conflict flags. */
export function computeConfidenceLevel(args: {
  isDefaultBaseline: boolean
  reasons: ReasonHit[]
  hasEcosystemConflict: boolean
  score: number
}): 'low' | 'medium' | 'high' {
  const { isDefaultBaseline, reasons, hasEcosystemConflict, score } = args
  const positiveCodes = new Set(reasons.map((r) => r.code))
  positiveCodes.delete('default-baseline')
  const distinctSignals = positiveCodes.size
  const strongCount =
    (positiveCodes.has('repo-role-match') ? 1 : 0) +
    (positiveCodes.has('stack-match') ? 1 : 0) +
    (positiveCodes.has('requires-any-match') ? 1 : 0)

  if (hasEcosystemConflict) return 'low'
  if (isDefaultBaseline && distinctSignals === 0) return 'medium'
  if (strongCount >= 2 && score >= 70) return 'high'
  if (strongCount >= 1 && distinctSignals >= 2 && score >= 50) return 'medium'
  if (distinctSignals === 1) return 'low'
  return distinctSignals >= 2 ? 'medium' : 'low'
}

/** Convert a confidence level to a 0–1 float, with a small bonus for high raw scores. */
export function confidenceLevelToNumber(level: 'low' | 'medium' | 'high', score: number): number {
  const base = level === 'high' ? 0.85 : level === 'medium' ? 0.6 : 0.3
  const bonus = Math.min(0.1, Math.max(0, score - 40) / 1000)
  return Number(Math.min(0.99, base + bonus).toFixed(2))
}

/** Read unstaged changed files from git to boost scoring for rules matching active work areas. */
export async function readChangedFiles(root: string): Promise<string[]> {
  if (process.env.HAUS_DISABLE_GIT_SIGNALS === '1') return []
  try {
    const result = await runGit(['diff', '--name-only'], { cwd: root })
    if (result.exitCode !== 0) {
      return []
    }
    return result.stdout
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .sort()
  } catch {
    return []
  }
}
