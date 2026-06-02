/**
 * Orchestrates scan → score → rank → filter → return recommendations.
 * Applies unsupported-stack, sensitive-path, and ecosystem-conflict policies before scoring.
 */

import { loadCatalog } from '../catalog/load-catalog.js'
import { SENSITIVE_ITEM_KEYWORDS } from '../security/sensitive-paths.js'
import type { ContextMap, Recommendation, RequiresAnyClause } from '../types.js'
import { runGit } from '../utils/exec.js'
import { readJson } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'

/** Stack tokens that trigger an immediate skip — haus does not support these ecosystems. */
const UNSUPPORTED = [
  'python',
  'django',
  'go',
  'rust',
  'java',
  'spring',
  'kotlin',
  'swift',
  'android',
  'flutter',
  'dart',
  'c++',
  'perl',
  'defi',
  'trading',
]

/** Maps ecosystem names to the repo roles that indicate that ecosystem is present. */
const ECOSYSTEM_GROUPS: Record<string, string[]> = {
  laravel: ['laravel-app', 'laravel-nova-app'],
  wordpress: ['wordpress-site', 'wordpress-bedrock-site', 'wordpress-vanilla-site'],
  vendure: ['vendure-app', 'vendure-plugin'],
  nestjs: ['nestjs-api'],
  nextjs: ['next-app'],
  react: ['react-app', 'next-app', 'design-system'],
  vue: ['vue-app'],
  dotnet: ['dotnet-service'],
  nx: ['nx-monorepo'],
  turbo: ['turbo-monorepo'],
}

/** Backend ecosystems that can act as a dominant backend for conflict detection. */
const ECOSYSTEM_PRIMARY_BACKENDS = new Set(['laravel', 'wordpress', 'vendure', 'nestjs', 'dotnet'])

/**
 * Which backend ecosystems are compatible inside a given dominant backend.
 * A backend ecosystem not listed for the dominant ecosystem triggers ecosystem-conflict penalty.
 * Example: a Vendure repo legitimately uses NestJS rules; a Laravel repo does not.
 */
const ECOSYSTEM_COMPATIBLE_BACKENDS: Record<string, Set<string>> = {
  vendure: new Set(['vendure', 'nestjs']),
  nestjs: new Set(['nestjs']),
  laravel: new Set(['laravel']),
  wordpress: new Set(['wordpress']),
  dotnet: new Set(['dotnet']),
}

/** A positive scoring signal with its reason code, message, weight and optional signal tag. */
type ReasonHit = {
  code: string
  message: string
  weight: number
  signal?: string
}
/** A negative scoring signal (penalty) that can reduce or eliminate a recommendation. */
type SkipHit = {
  code: string
  message: string
  penalty: number
  signal?: string
}

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
    const blob = `${item.id} ${item.tags.join(' ')}`.toLowerCase()
    if (UNSUPPORTED.some((x) => blob.includes(x))) {
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

    if (SENSITIVE_ITEM_KEYWORDS.some((x) => blob.includes(x))) {
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

/** Derive the set of active ecosystems from the repo's detected roles. */
function inferRepoEcosystems(roles: string[]): string[] {
  const ecosystems = new Set<string>()
  for (const [eco, roleList] of Object.entries(ECOSYSTEM_GROUPS)) {
    if (roleList.some((r) => roles.includes(r))) ecosystems.add(eco)
  }
  return [...ecosystems]
}

/** Return the first backend ecosystem in the list, used as the conflict-detection anchor. */
function pickDominantBackend(ecosystems: string[]): string | undefined {
  for (const eco of ecosystems) {
    if (ECOSYSTEM_PRIMARY_BACKENDS.has(eco)) return eco
  }
  return undefined
}

function isBackendEcosystem(eco: string): boolean {
  return ECOSYSTEM_PRIMARY_BACKENDS.has(eco)
}

/** Check whether at least one requiresAny clause is satisfied by the project context. */
function matchRequiresAny(
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
function describeRequiresAny(clauses: RequiresAnyClause[]): string {
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

/** Derive a confidence level (low/medium/high) from scoring signals and conflict flags. */
function computeConfidenceLevel(args: {
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
function confidenceLevelToNumber(level: 'low' | 'medium' | 'high', score: number): number {
  const base = level === 'high' ? 0.85 : level === 'medium' ? 0.6 : 0.3
  const bonus = Math.min(0.1, Math.max(0, score - 40) / 1000)
  return Number(Math.min(0.99, base + bonus).toFixed(2))
}

/** Combine context scan warnings with any active security-risk signals into the final warnings list. */
function mergeRecommendationWarnings(context: ContextMap): string[] {
  // Surface detectionStatus as a clear, leading message. Baseline (stack-agnostic
  // workflow + security) guidance still applies to unknown/partial repos, so this
  // informs rather than drops recommendations.
  const markers = context.unsupportedSignals?.join(', ')
  const statusLines =
    context.detectionStatus === 'unknown'
      ? [
          markers
            ? `Stack not recognised — detected ${markers}, which haus does not support. Only stack-agnostic workflow and security guidance applies.`
            : 'Stack not recognised — no supported framework detected. Only stack-agnostic workflow and security guidance applies.',
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

/** Read unstaged changed files from git to boost scoring for rules matching active work areas. */
async function readChangedFiles(root: string): Promise<string[]> {
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
