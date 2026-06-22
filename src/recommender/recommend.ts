/**
 * Orchestrates scan → policy-gate → eligibility → return recommendations.
 *
 * Eligibility is BINARY: an item is recommended iff it passes every policy gate
 * (unsupported/curated/sensitive/source/required-role/requiresAny) AND is a
 * catalog default OR has at least one positive match signal. No scores, no
 * confidence — the gates are correctness/security, the signals are eligibility.
 *
 * A second pass picks up the writing-documentation skill's deep-context.json
 * (LLM-discovered roles/stacks/patterns) so skills the shallow scanner missed
 * become eligible. Absent that file, output is identical to the scanner-only pass.
 */

import { loadCatalog } from '../catalog/load-catalog.js'
import { SENSITIVE_ITEM_KEYWORDS } from '../security/sensitive-paths.js'
import type { ContextMap, DeepContext, Recommendation } from '../types.js'
import { readJson } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'

import { readChangedFiles } from './git-signal.js'
import {
  UNSUPPORTED,
  describeRequiresAny,
  matchRequiresAny,
  mergeRecommendationWarnings,
} from './policies.js'
import { estimateContextTokens, tokenReductionPct } from './token-estimate.js'

/** A positive eligibility signal: why an item matched the project context. */
type ReasonHit = { code: string; message: string; signal?: string }

/**
 * Run the full recommendation pipeline for a project.
 * Loads catalog items, gates and matches each against the ContextMap (plus any
 * deep-context enrichment), and returns the eligible set.
 */
export async function recommend(root: string, context: ContextMap): Promise<Recommendation> {
  const items = await loadCatalog(root)
  const sources =
    (await readJson<{ items?: Array<{ id: string; status?: string }> }>(
      hausPath(root, 'sources-report.json'),
    )) ?? {}
  const deep = (await readJson<DeepContext>(hausPath(root, 'deep-context.json'))) ?? {}

  // Scanner (shallow) signal sets.
  const scannerStacks = buildStackSet(context)
  const scannerRoles = new Set(context.repoRoles.map((r) => r.toLowerCase()))
  const scannerDeps = new Set(context.dependencies.map((d) => d.toLowerCase()))

  // Deep (LLM) signal sets — defensively parsed; tagged distinctly when matched.
  // deep-context.json is LLM-authored, so every field may be the wrong shape:
  // coerce to string[] and never let a bad shape throw and break the headless path.
  const toStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const deepStackValues =
    deep.stacks && typeof deep.stacks === 'object' && !Array.isArray(deep.stacks)
      ? Object.values(deep.stacks).flatMap(toStrings)
      : []
  const deepRoles = new Set(toStrings(deep.roles).map((r) => r.toLowerCase()))
  const deepStacks = new Set(
    [...toStrings(deep.roles), ...deepStackValues, ...toStrings(deep.patterns)].map((x) =>
      x.toLowerCase(),
    ),
  )

  // Merged sets drive matching; the per-token origin drives the signal prefix.
  const roleSet = new Set([...scannerRoles, ...deepRoles])
  const stackSet = new Set([...scannerStacks, ...deepStacks])
  const depSet = scannerDeps

  const recommended: Recommendation['recommended'] = []
  const skipped: Recommendation['skipped'] = []
  const sourceTrust = new Map((sources.items ?? []).map((x) => [x.id, x.status ?? 'candidate']))
  const changedFiles = await readChangedFiles(root)

  const skip = (id: string, code: string, message: string, signal?: string) => {
    skipped.push({ id, reason: message, skipReasons: [{ code, message, signal }] })
  }
  const roleSignal = (name: string) =>
    scannerRoles.has(name.toLowerCase()) ? `role:${name}` : `deep:role:${name}`
  const stackSignal = (name: string) =>
    scannerStacks.has(name.toLowerCase()) ? `tag:${name}` : `deep:tag:${name}`

  for (const item of items) {
    const itemSearchText = `${item.id} ${item.tags.join(' ')}`.toLowerCase()

    // ---- Policy gates (hard include/exclude — correctness & security) ----
    if (UNSUPPORTED.some((x) => itemSearchText.includes(x))) {
      skip(item.id, 'unsupported-policy', 'Unsupported stack policy')
      continue
    }
    // Config items (ESLint, Prettier) are project-root files distributed via
    // `haus scaffold`, never written to `.claude/` by apply. Keep them out of the
    // recommended/installed set (and out of token stats) but surface the hint.
    if (item.type === 'config') {
      skip(
        item.id,
        'config-scaffold-only',
        'Config item — install with `haus scaffold`',
        'type:config',
      )
      continue
    }
    if (item.reviewStatus === 'deprecated') {
      skip(item.id, 'deprecated', 'Catalog item is deprecated', 'reviewStatus:deprecated')
      continue
    }
    if (item.source === 'curated') {
      const rs = item.reviewStatus
      if (!rs || rs !== 'approved') {
        skip(
          item.id,
          'curated-not-approved',
          `Curated item requires reviewStatus:approved (got ${rs ?? 'unset'})`,
          `reviewStatus:${rs ?? 'unset'}`,
        )
        continue
      }
      if (item.riskLevel === 'blocked') {
        skip(
          item.id,
          'curated-risk-blocked',
          'Curated item riskLevel is blocked',
          'riskLevel:blocked',
        )
        continue
      }
    }
    if (SENSITIVE_ITEM_KEYWORDS.some((x) => itemSearchText.includes(x))) {
      skip(item.id, 'sensitive-policy', 'Sensitive content policy block')
      continue
    }
    const trust = sourceTrust.get(item.source)
    if (trust === 'candidate' || trust === 'rejected') {
      skip(item.id, 'source-trust', 'Source trust policy block', `trust:${trust}`)
      continue
    }
    if (item.source && item.source !== 'haus' && trust !== 'approved') {
      skip(item.id, 'source-approval', 'Source not approved', `source:${item.source}`)
      continue
    }
    if (item.id === 'haus.nx21-monorepo-patterns' && !roleSet.has('nx-monorepo')) {
      skip(
        item.id,
        'required-role-missing',
        'Required role missing: nx-monorepo',
        'role:nx-monorepo',
      )
      continue
    }
    if (item.id === 'haus.turbo-monorepo-patterns' && !roleSet.has('turbo-monorepo')) {
      skip(
        item.id,
        'required-role-missing',
        'Required role missing: turbo-monorepo',
        'role:turbo-monorepo',
      )
      continue
    }
    if (item.id === 'haus.ecc-database-reviewer' && !roleSet.has('database')) {
      skip(item.id, 'required-role-missing', 'Required role missing: database', 'role:database')
      continue
    }
    if (
      item.id === 'haus.ecc-typescript-reviewer' &&
      (stackSet.has('react') ||
        stackSet.has('react19') ||
        stackSet.has('nextjs') ||
        stackSet.has('next') ||
        roleSet.has('react-app') ||
        roleSet.has('next-app'))
    ) {
      skip(
        item.id,
        'co-install-react-reviewer',
        'Skip typescript-reviewer on React/Next stacks (use react-reviewer)',
        'stack:react|nextjs|role:react-app|next-app',
      )
      continue
    }

    // ---- Eligibility signals ----
    const isDefaultBaseline = item.default === true
    const reasons: ReasonHit[] = []
    const push = (code: string, message: string, signal?: string) =>
      reasons.push({ code, message, signal })

    if (isDefaultBaseline) push('default-baseline', 'catalog default baseline', 'policy:default')

    const roleMatch = item.repoRoles.find((r) => roleSet.has(r.toLowerCase()))
    if (roleMatch) push('repo-role-match', 'repo role match', roleSignal(roleMatch))

    const tagMatch = item.tags.find((t) => stackSet.has(t.toLowerCase()))
    if (tagMatch) push('stack-match', 'stack/dependency match', stackSignal(tagMatch))

    const pm = context.packageManager
    const pmVersionedMatch =
      pm === 'yarn' || pm === 'pnpm'
        ? item.tags.includes(pm) || item.tags.includes(`${pm}4`) || item.tags.includes(`${pm}89`)
        : item.tags.includes(pm)
    if (pmVersionedMatch) {
      push(
        'package-manager-match',
        'package manager match',
        `packageManager:${context.packageManager}`,
      )
    }

    const configSignal = item.tags.find((t) =>
      context.warnings.join(' ').toLowerCase().includes(t.toLowerCase()),
    )
    if (configSignal) push('config-signal-match', 'config signal match', `warning:${configSignal}`)

    const idSegment = item.id.split('.').pop() ?? ''
    const changedMatch = idSegment ? changedFiles.find((f) => f.includes(idSegment)) : undefined
    if (changedMatch)
      push('changed-file-match', 'changed file match', `changedFile:${changedMatch}`)

    // ---- requiresAny gate (eligibility constraint) ----
    const requiresAny = item.requiresAny ?? []
    if (requiresAny.length > 0) {
      const satisfied = matchRequiresAny(requiresAny, { stackSet, depSet, roleSet })
      if (!satisfied.matched) {
        const description = describeRequiresAny(requiresAny)
        skip(
          item.id,
          'requires-any-unsatisfied',
          `requiresAny unsatisfied: needs ${description}`,
          description,
        )
        continue
      }
      if (!reasons.some((r) => r.code === 'stack-match')) {
        push('requires-any-match', 'requires-any signal match', satisfied.signal)
      }
    }

    // ---- Binary decision: default OR any positive evidence ----
    const hasEvidence = reasons.some((r) => r.code !== 'default-baseline')
    if (isDefaultBaseline || hasEvidence) {
      recommended.push({
        id: item.id,
        type: item.type,
        reason: reasons.length ? reasons.map((x) => x.message).join(', ') : 'eligible',
        reasons,
        selectionMode: isDefaultBaseline && !hasEvidence ? 'baseline' : 'matched',
        install: true,
        tags: item.tags,
        ecosystem: item.ecosystem,
        tokenEstimate: item.tokenEstimate,
      })
    } else {
      skip(item.id, 'no-role-stack-match', 'No role/stack match')
    }
  }

  applyCoInstallSuppression(recommended, skipped)

  recommended.sort((a, b) => a.id.localeCompare(b.id))
  skipped.sort((a, b) => a.id.localeCompare(b.id))
  const selectedRules = recommended.length
  const skippedRules = skipped.length
  const estimatedContextTokens = estimateContextTokens(selectedRules)
  const estimatedTokenReductionPct = tokenReductionPct(selectedRules, skippedRules)
  return {
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

type RecommendedEntry = Recommendation['recommended'][number]
type SkippedEntry = Recommendation['skipped'][number]

/** Drop redundant catalog items when a more specific co-installed skill already covers the concern. */
function applyCoInstallSuppression(recommended: RecommendedEntry[], skipped: SkippedEntry[]): void {
  const recommendedIds = new Set(recommended.map((r) => r.id))
  const rules: Array<{
    suppress: string
    whenAnyRecommended: string[]
    code: string
    message: string
    signal: string
  }> = [
    {
      suppress: 'haus.sentry-sentry-workflow',
      whenAnyRecommended: [
        'haus.sentry-sentry-php-sdk',
        'haus.sentry-sentry-nextjs-sdk',
        'haus.sentry-sentry-node-sdk',
        'haus.sentry-sentry-nestjs-sdk',
      ],
      code: 'co-install-sentry-sdk',
      message: 'Skip sentry-workflow when a stack-specific Sentry SDK skill is selected',
      signal: 'co-install:sentry-sdk',
    },
    {
      suppress: 'haus.ecc-e2e-runner',
      whenAnyRecommended: ['haus.ecc-e2e-testing'],
      code: 'co-install-e2e-skill',
      message: 'Skip e2e-runner when e2e-testing skill covers patterns',
      signal: 'co-install:e2e-testing',
    },
    {
      suppress: 'haus.oh-my-claudecode-test-engineer',
      whenAnyRecommended: ['haus.ecc-e2e-testing', 'haus.ecc-e2e-runner'],
      code: 'co-install-e2e-coverage',
      message: 'Skip oh-my test-engineer when ECC e2e skill or agent is selected',
      signal: 'co-install:e2e-coverage',
    },
    {
      suppress: 'haus.wshobson-js-testing-patterns',
      whenAnyRecommended: ['haus.ecc-react-testing'],
      code: 'co-install-react-testing',
      message: 'Skip js-testing-patterns when ecc-react-testing covers component tests',
      signal: 'co-install:react-testing',
    },
    {
      suppress: 'haus.superpowers-test-driven-development',
      whenAnyRecommended: ['haus.wshobson-js-testing-patterns', 'haus.ecc-react-testing'],
      code: 'co-install-stack-testing',
      message: 'Skip TDD superpower when a stack testing skill is selected',
      signal: 'co-install:stack-testing',
    },
    {
      suppress: 'haus.superpowers-specifying-gates',
      whenAnyRecommended: ['haus.superpowers-checking-gates'],
      code: 'co-install-gate-workflow',
      message: 'Skip specifying-gates when checking-gates is selected',
      signal: 'co-install:checking-gates',
    },
    {
      suppress: 'haus.ecc-redis-patterns',
      whenAnyRecommended: ['haus.redis-redis-connections'],
      code: 'co-install-redis-official',
      message: 'Skip ecc-redis-patterns when official redis-connections skill is selected',
      signal: 'co-install:redis-connections',
    },
  ]

  for (const rule of rules) {
    if (!recommendedIds.has(rule.suppress)) continue
    if (!rule.whenAnyRecommended.some((id) => recommendedIds.has(id))) continue
    const idx = recommended.findIndex((r) => r.id === rule.suppress)
    if (idx === -1) continue
    const [removed] = recommended.splice(idx, 1)
    recommendedIds.delete(rule.suppress)
    skipped.push({
      id: removed.id,
      reason: rule.message,
      skipReasons: [{ code: rule.code, message: rule.message, signal: rule.signal }],
    })
  }
}
