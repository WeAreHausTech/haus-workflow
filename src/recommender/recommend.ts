/**
 * Orchestrates scan → score → rank → filter → return recommendations.
 * Applies unsupported-stack, sensitive-path, and ecosystem-conflict policies before scoring.
 */

import { loadCatalog } from '../catalog/load-catalog.js'
import { SENSITIVE_ITEM_KEYWORDS } from '../security/sensitive-paths.js'
import type { ContextMap, Recommendation } from '../types.js'
import { readJson } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'

import {
  ECOSYSTEM_COMPATIBLE_BACKENDS,
  inferRepoEcosystems,
  isBackendEcosystem,
  pickDominantBackend,
} from './ecosystem.js'
import {
  UNSUPPORTED,
  describeRequiresAny,
  matchRequiresAny,
  mergeRecommendationWarnings,
} from './policies.js'
import {
  type ReasonHit,
  type SkipHit,
  computeConfidenceLevel,
  confidenceLevelToNumber,
  readChangedFiles,
} from './scoring.js'

/**
 * Run the full recommendation pipeline for a project.
 * Loads catalog items, scores each against the ContextMap, and returns a ranked Recommendation.
 */
export async function recommend(root: string, context: ContextMap): Promise<Recommendation> {
  const items = await loadCatalog(root)
  const setupAnswers =
    (await readJson<Record<string, string>>(hausPath(root, 'setup-answers.json'))) ?? {}
  const sources =
    (await readJson<{ items?: Array<{ id: string; status?: string }> }>(
      hausPath(root, 'sources-report.json'),
    )) ?? {}
  const stackSet = buildStackSet(context)
  const depSet = new Set(context.dependencies.map((d) => d.toLowerCase()))
  const roleSet = new Set(context.repoRoles.map((r) => r.toLowerCase()))
  const repoEcosystems = inferRepoEcosystems(context.repoRoles)
  const dominantBackendEcosystem = pickDominantBackend(repoEcosystems)

  const recommended: Recommendation['recommended'] = []
  const skipped: Recommendation['skipped'] = []
  const goals = Object.values(setupAnswers).join(' ').toLowerCase()
  const sourceTrust = new Map((sources.items ?? []).map((x) => [x.id, x.status ?? 'candidate']))
  const changedFiles = await readChangedFiles(root)
  const securityRiskCount = context.securityRisks?.length ?? 0

  for (const item of items) {
    const itemSearchText = `${item.id} ${item.tags.join(' ')}`.toLowerCase()
    if (UNSUPPORTED.some((x) => itemSearchText.includes(x))) {
      skipped.push({
        id: item.id,
        reason: 'Unsupported stack policy',
        skipReasons: [
          {
            code: 'unsupported-policy',
            message: 'Unsupported stack policy',
            penalty: 100,
          },
        ],
      })
      continue
    }

    // Curated items must be explicitly approved before they can be recommended.
    if (item.source === 'curated') {
      const rs = item.reviewStatus
      if (!rs || rs !== 'approved') {
        skipped.push({
          id: item.id,
          reason: `Curated item not approved (reviewStatus=${rs ?? 'unset'})`,
          skipReasons: [
            {
              code: 'curated-not-approved',
              message: `Curated item requires reviewStatus:approved (got ${rs ?? 'unset'})`,
              penalty: 100,
              signal: `reviewStatus:${rs ?? 'unset'}`,
            },
          ],
        })
        continue
      }
      if (item.riskLevel === 'blocked') {
        skipped.push({
          id: item.id,
          reason: 'Curated item risk level is blocked',
          skipReasons: [
            {
              code: 'curated-risk-blocked',
              message: 'Curated item riskLevel is blocked',
              penalty: 100,
              signal: 'riskLevel:blocked',
            },
          ],
        })
        continue
      }
    }

    const isDefaultBaseline = item.default === true
    const reasons: ReasonHit[] = []
    const skipReasons: SkipHit[] = []
    let score = 0

    const pushReason = (code: string, message: string, weight: number, signal?: string) => {
      score += weight
      reasons.push({ code, message, weight, signal })
    }
    const pushSkipReason = (code: string, message: string, penalty: number, signal?: string) => {
      score -= penalty
      skipReasons.push({ code, message, penalty, signal })
    }

    if (isDefaultBaseline) {
      pushReason('default-baseline', 'catalog default baseline', 25, 'policy:default')
    }

    const roleMatch = item.repoRoles.find((r) => roleSet.has(r.toLowerCase()))
    if (roleMatch) {
      pushReason('repo-role-match', 'repo role match', 40, `role:${roleMatch}`)
    }

    const tagMatch = item.tags.find((t) => stackSet.has(t.toLowerCase()))
    if (tagMatch) {
      pushReason('stack-match', 'stack/dependency match', 30, `tag:${tagMatch}`)
    }

    const goalMatch = item.tags.find(
      (t) => goals.includes(t) || goals.includes(t.replace(/-/g, ' ')),
    )
    if (goalMatch) {
      pushReason('goal-match', 'guided goal match', 15, `goal:${goalMatch}`)
    }

    if (
      item.tags.includes(context.packageManager) ||
      item.tags.includes(`${context.packageManager}4`) ||
      item.tags.includes(`${context.packageManager}89`)
    ) {
      pushReason(
        'package-manager-match',
        'package manager match',
        10,
        `packageManager:${context.packageManager}`,
      )
    }

    const configSignal = item.tags.find((t) =>
      context.warnings.join(' ').toLowerCase().includes(t.toLowerCase()),
    )
    if (configSignal) {
      pushReason('config-signal-match', 'config signal match', 20, `warning:${configSignal}`)
    }

    const changedMatch = changedFiles.find((f) => f.includes(item.id.split('.').pop() ?? ''))
    if (changedMatch) {
      pushReason('changed-file-match', 'changed file match', 10, `changedFile:${changedMatch}`)
    }

    if (item.id === 'haus.nx21-monorepo-patterns' && !roleSet.has('nx-monorepo')) {
      skipped.push({
        id: item.id,
        reason: 'Required role missing: nx-monorepo',
        skipReasons: [
          {
            code: 'required-role-missing',
            message: 'Required role missing: nx-monorepo',
            penalty: 100,
            signal: 'role:nx-monorepo',
          },
        ],
      })
      continue
    }
    if (item.id === 'haus.turbo-monorepo-patterns' && !roleSet.has('turbo-monorepo')) {
      skipped.push({
        id: item.id,
        reason: 'Required role missing: turbo-monorepo',
        skipReasons: [
          {
            code: 'required-role-missing',
            message: 'Required role missing: turbo-monorepo',
            penalty: 100,
            signal: 'role:turbo-monorepo',
          },
        ],
      })
      continue
    }

    const requiresAny = item.requiresAny ?? []
    if (requiresAny.length > 0) {
      const satisfied = matchRequiresAny(requiresAny, {
        stackSet,
        depSet,
        roleSet,
      })
      if (!satisfied.matched) {
        const description = describeRequiresAny(requiresAny)
        skipped.push({
          id: item.id,
          reason: `requiresAny unsatisfied: needs ${description}`,
          skipReasons: [
            {
              code: 'requires-any-unsatisfied',
              message: `requiresAny unsatisfied: needs ${description}`,
              penalty: 100,
              signal: description,
            },
          ],
        })
        continue
      }
      if (!reasons.some((r) => r.code === 'stack-match')) {
        pushReason('requires-any-match', 'requires-any signal match', 25, satisfied.signal)
      }
    }

    if (item.ecosystem && dominantBackendEcosystem && isBackendEcosystem(item.ecosystem)) {
      const compat =
        ECOSYSTEM_COMPATIBLE_BACKENDS[dominantBackendEcosystem] ??
        new Set([dominantBackendEcosystem])
      if (!compat.has(item.ecosystem)) {
        pushSkipReason(
          'ecosystem-conflict',
          `ecosystem conflict: rule ecosystem=${item.ecosystem} but repo dominant backend=${dominantBackendEcosystem}`,
          40,
          `ecosystem:${item.ecosystem}->${dominantBackendEcosystem}`,
        )
      }
    }

    if (SENSITIVE_ITEM_KEYWORDS.some((x) => itemSearchText.includes(x))) {
      pushSkipReason('sensitive-policy', 'Sensitive content policy block', 100)
    }

    const trust = sourceTrust.get(item.source)
    if (trust === 'candidate' || trust === 'rejected') {
      pushSkipReason('source-trust', 'Source trust policy block', 100)
    }
    if (item.source && item.source !== 'haus' && trust !== 'approved') {
      pushSkipReason('source-approval', 'Source not approved', 100)
    }
    if (
      securityRiskCount > 0 &&
      !isDefaultBaseline &&
      (item.tags.includes('security') || item.id.includes('security'))
    ) {
      pushSkipReason(
        'security-risk-penalty',
        'Security-tagged item penalized by active risk signals',
        20,
      )
    }

    const positiveReasonCodes = new Set(
      reasons.map((r) => r.code).filter((c) => c !== 'default-baseline'),
    )
    const hasRoleSignal = positiveReasonCodes.has('repo-role-match')
    const hasDepOrStackSignal =
      positiveReasonCodes.has('stack-match') || positiveReasonCodes.has('requires-any-match')

    if (hasRoleSignal && !hasDepOrStackSignal && !isDefaultBaseline && requiresAny.length === 0) {
      pushSkipReason(
        'role-only-bleed-guard',
        'role match without dep/stack signal (role-only bleed)',
        25,
        roleMatch ? `role:${roleMatch}` : undefined,
      )
    }

    const minScore = isDefaultBaseline ? 1 : 40
    if (score >= minScore) {
      const confidenceLevel = computeConfidenceLevel({
        isDefaultBaseline,
        reasons,
        hasEcosystemConflict: skipReasons.some((s) => s.code === 'ecosystem-conflict'),
        score,
      })
      const confidence = confidenceLevelToNumber(confidenceLevel, score)
      recommended.push({
        id: item.id,
        type: item.type,
        reason: reasons.length ? reasons.map((x) => x.message).join(', ') : `score=${score}`,
        reasons,
        confidence,
        confidenceLevel,
        selectionMode:
          isDefaultBaseline && reasons.every((r) => r.code === 'default-baseline')
            ? 'baseline'
            : 'matched',
        install: true,
        score,
        scoreBreakdown: {
          bonuses: reasons,
          penalties: skipReasons,
          finalScore: score,
        },
        tags: item.tags,
        ecosystem: item.ecosystem,
        tokenEstimate: item.tokenEstimate,
      })
    } else {
      if (skipReasons.length === 0) {
        skipReasons.push({
          code: 'no-role-stack-match',
          message: 'No role/stack match',
          penalty: 0,
        })
      }
      const primary = skipReasons[0]
      skipped.push({ id: item.id, reason: primary.message, skipReasons })
    }
  }

  recommended.sort((a, b) => a.id.localeCompare(b.id))
  skipped.sort((a, b) => a.id.localeCompare(b.id))
  const estimatedContextTokens = recommended.length * 320
  const selectedRules = recommended.length
  const skippedRules = skipped.length
  const estimatedTokenReductionPct = Math.max(
    0,
    Math.round((skippedRules / Math.max(selectedRules + skippedRules, 1)) * 100),
  )
  return {
    mode: context.mode,
    recommended,
    skipped,
    warnings: mergeRecommendationWarnings(context),
    estimatedContextTokens,
    selectedRules,
    skippedRules,
    estimatedTokenReductionPct,
  }
}

/** Flatten all detected stacks and repo roles into a single lowercase lookup set. */
function buildStackSet(context: ContextMap): Set<string> {
  return new Set(
    [...context.repoRoles, ...Object.values(context.detectedStacks).flat()].map((x) =>
      x.toLowerCase(),
    ),
  )
}
