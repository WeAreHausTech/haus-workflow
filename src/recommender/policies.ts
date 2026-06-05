/** Policy filters for the recommender: unsupported stacks, requiresAny gating, warning merge. */

import { FORBIDDEN_TAGS } from '../catalog/validation-rules.js'
import type { ContextMap, RequiresAnyClause } from '../types.js'

/** Stack tokens that trigger an immediate skip — driven by validation-rules.json. */
export const UNSUPPORTED: readonly string[] = FORBIDDEN_TAGS

/** Check whether at least one requiresAny clause is satisfied by the project context. */
export function matchRequiresAny(
  clauses: RequiresAnyClause[],
  ctx: { stackSet: Set<string>; depSet: Set<string>; roleSet: Set<string> },
): { matched: boolean; signal?: string } {
  for (const clause of clauses) {
    if ('stack' in clause) {
      if (ctx.stackSet.has(clause.stack.toLowerCase())) {
        return { matched: true, signal: `stack:${clause.stack}` }
      }
    } else if ('dependency' in clause) {
      if (ctx.depSet.has(clause.dependency.toLowerCase())) {
        return { matched: true, signal: `dependency:${clause.dependency}` }
      }
    } else if ('packageNamePattern' in clause) {
      const pattern = clause.packageNamePattern.toLowerCase()
      const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern
      for (const dep of ctx.depSet) {
        if (pattern.endsWith('*') ? dep.startsWith(prefix) : dep === pattern) {
          return {
            matched: true,
            signal: `packageNamePattern:${clause.packageNamePattern}`,
          }
        }
      }
    } else if ('role' in clause) {
      if (ctx.roleSet.has(clause.role.toLowerCase())) {
        return { matched: true, signal: `role:${clause.role}` }
      }
    }
  }
  return { matched: false }
}

/** Serialize requiresAny clauses into a human-readable string for skip messages. */
export function describeRequiresAny(clauses: RequiresAnyClause[]): string {
  return clauses
    .map((c) => {
      if ('stack' in c) return `stack=${c.stack}`
      if ('dependency' in c) return `dependency=${c.dependency}`
      if ('packageNamePattern' in c) return `packageNamePattern=${c.packageNamePattern}`
      if ('role' in c) return `role=${c.role}`
      return 'unknown'
    })
    .join(' | ')
}

/** Combine context scan warnings with any active security-risk signals into the final warnings list. */
export function mergeRecommendationWarnings(context: ContextMap): string[] {
  // Surface detectionStatus as a clear, leading message. Baseline (stack-agnostic
  // workflow + security) guidance still applies to unknown/partial repos, so this
  // informs rather than drops recommendations.
  const markers = context.unsupportedSignals?.join(', ')
  const statusLines =
    context.detectionStatus === 'unknown'
      ? [
          markers
            ? `Stack not recognised — detected ${markers}, which haus does not support. Only stack-agnostic workflow and security guidance is applied.`
            : 'Stack not recognised — no supported framework detected. Only stack-agnostic workflow and security guidance is applied.',
        ]
      : context.detectionStatus === 'partial' && markers
        ? [
            `Partially supported — found unsupported ${markers} alongside recognised stacks; guidance covers the supported parts only.`,
          ]
        : []
  const riskLines =
    (context.securityRisks?.length ?? 0) > 0
      ? [`Scan reported security signals: ${context.securityRisks.join('; ')}`]
      : []
  return [...new Set([...statusLines, ...context.warnings, ...riskLines])]
}
