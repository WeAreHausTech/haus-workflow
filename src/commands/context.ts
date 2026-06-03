/** `haus context` — emits task-scoped context (roles, selected rules, token estimate) for the current repo. */
import { isHookEnabled } from '../claude/load-hooks-config.js'
import { normalizeRecommendation } from '../recommender/explain-recommendation.js'
import {
  classifyTaskIntents,
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  pickTaskRelevantRules,
  type TaskIntent,
} from '../recommender/task-intent.js'
import { readContextOrScan } from '../scanner/read-context.js'
import type { Recommendation } from '../types.js'
import { readJson, readText } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { hausPath } from '../utils/paths.js'

/**
 * Emits task-scoped context including repo roles, selected rules, and token reduction estimate.
 * When called from a hook, output is truncated and gated by hooks.context.enabled.
 */
export async function runContext(options: {
  task?: string
  fromHook?: boolean
  json?: boolean
  verbose?: boolean
}): Promise<void> {
  const root = process.cwd()
  // Hook-mode short-circuit: per the P2 audit, this hook is gated default-off.
  // Opt in via `.haus-workflow/config.json` -> `hooks.context.enabled = true`.
  if (options.fromHook && !(await isHookEnabled(root, 'context'))) {
    return
  }
  const context = await readContextOrScan(root)
  const summary = (await readText(hausPath(root, 'repo-summary.md'))) ?? ''
  const recommendationRaw = await readJson<Recommendation>(hausPath(root, 'recommendation.json'))
  const recommendation = recommendationRaw ? normalizeRecommendation(recommendationRaw) : undefined
  const taskIntents = options.task ? classifyTaskIntents(options.task) : new Set<TaskIntent>()
  const selected = pickTaskRelevantRules(recommendation, options.task, taskIntents, {
    tokenBudget: DEFAULT_CONTEXT_TOKEN_BUDGET,
  })
  const payload = {
    task: options.task ?? 'not provided',
    taskIntents: [...taskIntents].sort(),
    roles: context.repoRoles,
    selectedRules: selected.map((x) => ({
      id: x.id,
      selectionMode: x.selectionMode,
      reasons: x.reasons.map((reason) => reason.message),
      ...(options.verbose ? { signals: x.reasons.map((r) => r.signal).filter(Boolean) } : {}),
    })),
    skippedCount: recommendation?.skippedRules ?? 0,
    estimatedTokenReductionPct: recommendation?.estimatedTokenReductionPct ?? 0,
  }

  if (options.json) {
    log(JSON.stringify(payload, null, 2))
    return
  }

  const lines = [
    '# Haus Context',
    `Task: ${payload.task}`,
    `Task intents: ${payload.taskIntents.join(', ') || '(none classified)'}`,
    `Roles: ${payload.roles.join(', ') || 'unknown'}`,
    `Selected rules: ${payload.selectedRules.length}`,
    `Skipped rules: ${payload.skippedCount}`,
    `Estimated token reduction: ${payload.estimatedTokenReductionPct}%`,
    'Use minimal context.',
    ...payload.selectedRules.flatMap((rule) => {
      const reasonLine = `- ${rule.id}: ${rule.reasons.join(', ')}`
      if (!options.verbose) return [reasonLine]
      const signals = (rule.signals ?? []).map((s) => `  • ${s}`)
      return [reasonLine, ...signals]
    }),
    summary,
  ]
  const text = lines.join('\n')
  log(options.fromHook ? text.slice(0, 3000) : text)
}
