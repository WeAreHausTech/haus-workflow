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

import { normalizeFormerIds } from '../catalog/former-ids.js'
import { loadCatalog } from '../catalog/load-catalog.js'
import { buildSourcesReport } from '../scanner/write-sources-report.js'
import { SENSITIVE_ITEM_KEYWORDS } from '../security/sensitive-paths.js'
import type { CatalogItem, ContextMap, DeepContext, Recommendation } from '../types.js'
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

/** One named policy/eligibility gate's outcome for a single item. */
type GateCheck = { name: string; passed: boolean; code: string; message: string; signal?: string }

/**
 * Run the full recommendation pipeline for a project.
 * Loads catalog items, gates and matches each against the ContextMap (plus any
 * deep-context enrichment), and returns the eligible set.
 */
export async function recommend(
  root: string,
  context: ContextMap,
  opts: { include?: string[] } = {},
): Promise<Recommendation> {
  const items = await loadCatalog(root)
  // Derive trust from live catalog items — NOT from on-disk sources-report.json which may
  // be stale (generated before a reviewStatus downgrade). This prevents a rejected item
  // from leaking through if the file hasn't been regenerated since the catalog changed.
  const sources = buildSourcesReport(items)
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
  const sourceTrust = new Map(sources.items.map((x) => [x.source, x.status]))
  const formerIds = new Set(items.flatMap((item) => normalizeFormerIds(item.formerIds)))
  const changedFiles = await readChangedFiles(root)

  const skip = (
    id: string,
    code: string,
    message: string,
    signal?: string,
    gates?: GateCheck[],
  ) => {
    skipped.push({
      id,
      reason: message,
      skipReasons: [{ code, message, signal }],
      ...(gates ? { gates: gates.map(({ name, passed }) => ({ name, passed })) } : {}),
    })
  }
  const roleSignal = (name: string) =>
    scannerRoles.has(name.toLowerCase()) ? `role:${name}` : `deep:role:${name}`
  const stackSignal = (name: string) =>
    scannerStacks.has(name.toLowerCase()) ? `tag:${name}` : `deep:tag:${name}`

  /**
   * Evaluate every named policy/eligibility gate for one item — no early exit.
   * Order matches the original sequential gate list exactly, so `gates.find(g => !g.passed)`
   * reproduces the legacy first-failure skip reason for backward compatibility.
   * A gate is included only when structurally applicable to the item (e.g. curated-only
   * gates are omitted for non-curated items) — omitted gates never count as a "failure"
   * for near-miss purposes, matching their original conditional-only evaluation.
   */
  const buildGateChecks = (
    item: CatalogItem,
    itemTags: string[],
    normSource: string,
  ): { gates: GateCheck[]; requiresAnySatisfied?: { matched: boolean; signal?: string } } => {
    const gates: GateCheck[] = []
    const add = (name: string, passed: boolean, code: string, message: string, signal?: string) => {
      gates.push({ name, passed, code, message, signal })
    }

    add(
      'former-id',
      !formerIds.has(item.id),
      'former-id',
      'Catalog id was renamed and cannot be newly recommended',
    )
    add('invalid-source', normSource !== '', 'invalid-source', 'Item source is missing or empty')
    add(
      'unsupported-policy',
      !UNSUPPORTED.some((x) => itemTags.includes(x)),
      'unsupported-policy',
      'Unsupported stack policy',
    )
    add(
      'deprecated',
      item.reviewStatus !== 'deprecated',
      'deprecated',
      'Catalog item is deprecated',
      'reviewStatus:deprecated',
    )
    if (normSource === 'curated') {
      const rs = item.reviewStatus
      add(
        'curated-not-approved',
        !!rs && rs === 'approved',
        'curated-not-approved',
        `Curated item requires reviewStatus:approved (got ${rs ?? 'unset'})`,
        `reviewStatus:${rs ?? 'unset'}`,
      )
      add(
        'curated-risk-blocked',
        item.riskLevel !== 'blocked',
        'curated-risk-blocked',
        'Curated item riskLevel is blocked',
        'riskLevel:blocked',
      )
    }
    const sensitiveInId = SENSITIVE_ITEM_KEYWORDS.some((x) => item.id.toLowerCase().includes(x))
    const sensitiveInTags = SENSITIVE_ITEM_KEYWORDS.some((x) => itemTags.includes(x))
    add(
      'sensitive-policy',
      !(sensitiveInId || sensitiveInTags),
      'sensitive-policy',
      'Sensitive content policy block',
    )
    // source-trust/source-approval require a valid source string to mean anything —
    // an item already failing invalid-source never reached these in the original code.
    if (normSource !== '') {
      const trust = sourceTrust.get(normSource)
      add(
        'source-trust',
        trust !== 'candidate' && trust !== 'rejected',
        'source-trust',
        'Source trust policy block',
        trust ? `trust:${trust}` : undefined,
      )
      add(
        'source-approval',
        normSource === 'haus' || trust === 'approved',
        'source-approval',
        'Source not approved',
        `source:${normSource}`,
      )
    }
    if (item.id === 'haus.turborepo-turborepo') {
      add(
        'required-role-missing:turbo-monorepo',
        roleSet.has('turbo-monorepo'),
        'required-role-missing',
        'Required role missing: turbo-monorepo',
        'role:turbo-monorepo',
      )
    }
    if (item.id === 'haus.ecc-database-reviewer') {
      add(
        'required-role-missing:database',
        roleSet.has('database'),
        'required-role-missing',
        'Required role missing: database',
        'role:database',
      )
    }

    let requiresAnySatisfied: { matched: boolean; signal?: string } | undefined
    const requiresAny = item.requiresAny ?? []
    if (requiresAny.length > 0) {
      const satisfied = matchRequiresAny(requiresAny, { stackSet, depSet, roleSet })
      requiresAnySatisfied = satisfied
      const description = describeRequiresAny(requiresAny)
      add(
        'requires-any-unsatisfied',
        satisfied.matched,
        'requires-any-unsatisfied',
        `requiresAny unsatisfied: needs ${description}`,
        description,
      )
    }

    return { gates, requiresAnySatisfied }
  }

  for (const item of items) {
    // Fail-closed: items with a missing or whitespace-only source field cannot be
    // trust-checked. `buildGateChecks` below still evaluates every other gate (to
    // populate the per-item `gates` breakdown), but `invalid-source` is first in gate
    // order, so such an item is always blocked via that first-failure regardless of
    // what else does or doesn't pass.
    const normSource = typeof item.source === 'string' ? item.source.trim() : ''
    // Normalised tag array — used for exact-tag gates to prevent substring false positives
    // (e.g. "javascript" tag must not match the "java" forbidden gate).
    const itemTags = item.tags.map((t) => t.toLowerCase())

    const { gates, requiresAnySatisfied } = buildGateChecks(item, itemTags, normSource)
    const firstFailure = gates.find((g) => !g.passed)
    if (firstFailure) {
      skip(item.id, firstFailure.code, firstFailure.message, firstFailure.signal, gates)
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

    const configSignal = item.tags.find((t) => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, 'i')
      return context.warnings.some((w) => re.test(w))
    })
    if (configSignal) push('config-signal-match', 'config signal match', `warning:${configSignal}`)

    const idSegment = item.id.split('.').pop() ?? ''
    const changedMatch = idSegment ? changedFiles.find((f) => f.includes(idSegment)) : undefined
    if (changedMatch)
      push('changed-file-match', 'changed file match', `changedFile:${changedMatch}`)

    // ---- requiresAny signal (eligibility constraint already gated above) ----
    // Reaching here means every named gate passed, including requires-any-unsatisfied
    // if applicable — so requiresAnySatisfied.matched is guaranteed true when present.
    if (requiresAnySatisfied && !reasons.some((r) => r.code === 'stack-match')) {
      push('requires-any-match', 'requires-any signal match', requiresAnySatisfied.signal)
    }

    const gateSummary = gates.map(({ name, passed }) => ({ name, passed }))

    // ---- Binary decision: default OR any positive evidence ----
    const hasEvidence = reasons.some((r) => r.code !== 'default-baseline')
    if (isDefaultBaseline || hasEvidence) {
      const isConfig = item.type === 'config'
      const entryReasons = isConfig
        ? [
            ...reasons,
            {
              code: 'config-scaffold',
              message: 'Install with `haus scaffold`',
              signal: 'type:config',
            },
          ]
        : reasons
      recommended.push({
        id: item.id,
        type: item.type,
        reason: entryReasons.length ? entryReasons.map((x) => x.message).join(', ') : 'eligible',
        reasons: entryReasons,
        selectionMode: isDefaultBaseline && !hasEvidence ? 'baseline' : 'matched',
        install: !isConfig,
        tags: item.tags,
        ecosystem: item.ecosystem,
        tokenEstimate: item.tokenEstimate,
        gates: gateSummary,
      })
    } else {
      skip(item.id, 'no-role-stack-match', 'No role/stack match', undefined, gates)
    }
  }

  applyCoInstallSuppression(recommended, skipped)

  // Manual includes win over gates/suppression (but never over hard policy blocks).
  const includeWarnings = applyManualIncludes(opts.include ?? [], items, recommended, skipped)

  // Opt-in eligible: role-gated tier items the user could add but whose role gate
  // is unsatisfied. Surfaced so the setup UX can offer them via `--include`.
  const optInEligible = buildOptInEligible(items, skipped)

  recommended.sort((a, b) => a.id.localeCompare(b.id))
  skipped.sort((a, b) => a.id.localeCompare(b.id))
  const installableRecommended = recommended.filter((item) => item.install)
  const selectedRules = installableRecommended.length
  const skippedRules = skipped.length
  const estimatedContextTokens = estimateContextTokens(selectedRules)
  const estimatedTokenReductionPct = tokenReductionPct(selectedRules, skippedRules)
  return {
    recommended,
    skipped,
    optInEligible,
    warnings: [...mergeRecommendationWarnings(context), ...includeWarnings],
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
    {
      suppress: 'haus.ecc-typescript-reviewer',
      whenAnyRecommended: ['haus.ecc-react-reviewer'],
      code: 'co-install-react-reviewer',
      message: 'Skip typescript-reviewer on React/Next stacks (use react-reviewer)',
      signal: 'co-install:react-reviewer',
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

/**
 * Skip codes that represent hard policy blocks — items skipped for these reasons
 * must NOT be force-installed via `--include` (they are correctness/security gates).
 */
const HARD_SKIP_CODES = new Set([
  'former-id',
  'unsupported-policy',
  'deprecated',
  'curated-not-approved',
  'curated-risk-blocked',
  'sensitive-policy',
  'source-trust',
  'source-approval',
])

/**
 * Promote explicitly requested ids into the recommended set as `manual` selections.
 * Honors hard policy blocks (those are never forced), warns on unknown ids and on
 * promoting an item whose requiresAny gate is unsatisfied. Returns warning lines.
 */
function applyManualIncludes(
  include: string[],
  items: CatalogItem[],
  recommended: RecommendedEntry[],
  skipped: SkippedEntry[],
): string[] {
  const warnings: string[] = []
  if (include.length === 0) return warnings
  const byId = new Map(items.map((i) => [i.id, i]))
  const recommendedIds = new Set(recommended.map((r) => r.id))

  for (const id of include) {
    const item = byId.get(id)
    if (!item) {
      warnings.push(`--include: unknown catalog id "${id}" (not in manifest)`)
      continue
    }
    if (recommendedIds.has(id)) continue // already eligible

    const skipIdx = skipped.findIndex((s) => s.id === id)
    const skipCode = skipIdx >= 0 ? skipped[skipIdx]!.skipReasons[0]?.code : undefined
    if (skipCode && HARD_SKIP_CODES.has(skipCode)) {
      warnings.push(`--include: "${id}" cannot be force-installed (blocked by ${skipCode})`)
      continue
    }
    if (skipCode === 'requires-any-unsatisfied') {
      warnings.push(`--include: "${id}" added manually though its requiresAny gate is unsatisfied`)
    }
    if (skipIdx >= 0) skipped.splice(skipIdx, 1)

    const isConfig = item.type === 'config'
    recommended.push({
      id: item.id,
      type: item.type,
      reason: 'manually included',
      reasons: [
        {
          code: 'manual-include',
          message: 'manually included via --include',
          signal: 'selection:manual',
        },
      ],
      selectionMode: 'manual',
      install: !isConfig,
      tags: item.tags,
      ecosystem: item.ecosystem,
      tokenEstimate: item.tokenEstimate,
    })
    recommendedIds.add(id)
  }
  return warnings
}

/** Build the opt-in-eligible list: role-gated tier items skipped for an unsatisfied gate. */
function buildOptInEligible(
  items: CatalogItem[],
  skipped: SkippedEntry[],
): NonNullable<Recommendation['optInEligible']> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const eligible: NonNullable<Recommendation['optInEligible']> = []
  for (const entry of skipped) {
    if (entry.skipReasons[0]?.code !== 'requires-any-unsatisfied') continue
    const item = byId.get(entry.id)
    if (!item?.optInTier || !item.optInGroup) continue
    eligible.push({
      id: item.id,
      type: item.type,
      title: item.title,
      optInTier: item.optInTier,
      optInGroup: item.optInGroup,
      purpose: item.purpose,
      tokenEstimate: item.tokenEstimate,
      requires: entry.skipReasons[0]?.signal ?? describeRequiresAny(item.requiresAny ?? []),
    })
  }
  eligible.sort((a, b) => a.optInGroup.localeCompare(b.optInGroup) || a.id.localeCompare(b.id))
  return eligible
}
