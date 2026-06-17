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
