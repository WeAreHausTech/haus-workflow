/** `haus decisions` — gate, suggest, validate, and number ADRs. */
import path from 'node:path'

import { runDecisionsCheck } from '../decisions/check.js'
import { nextDecisionNumber } from '../decisions/next-number.js'
import { runDecisionsSuggest } from '../decisions/suggest.js'
import { validateDecisionFile } from '../decisions/validate.js'
import { error, log, warn } from '../utils/logger.js'

type CheckOptions = {
  staged?: boolean
  range?: string
  prBody?: string
}

export async function runDecisions(
  sub: 'check' | 'suggest' | 'next-number' | 'validate',
  arg?: string,
  options: CheckOptions & { fromHook?: boolean; title?: string } = {},
): Promise<void> {
  const root = process.cwd()

  if (sub === 'check') {
    const commitMessages =
      options.range != null
        ? (
            await import('../utils/exec.js').then((m) =>
              m.runGit(['log', '--format=%B', options.range!], { cwd: root }),
            )
          ).stdout
        : ''
    const result = await runDecisionsCheck(root, {
      staged: options.staged,
      range: options.range,
      prBody: options.prBody ?? process.env.PR_BODY,
      commitMessages,
    })
    if (!result.triggered) {
      log(result.reasons[0] ?? 'no decision-worthy changes')
      return
    }
    if (result.satisfied) {
      if (result.reasons.some((r) => r.includes('[adr-skip]'))) {
        warn(`::warning::${result.reasons.join('; ')}`)
      }
      log(`decisions gate: satisfied (${result.reasons.join('; ')})`)
      return
    }
    for (const reason of result.reasons) warn(reason)
    error(
      'decisions gate: decision-worthy change without a valid ADR under docs/decisions/. ' +
        'Run `haus decisions suggest`, add docs/decisions/NNNN-*.md + README row, or use [adr-skip] with justification.',
    )
    process.exitCode = 1
    return
  }

  if (sub === 'suggest') {
    await runDecisionsSuggest(root, { fromHook: options.fromHook, title: options.title })
    return
  }

  if (sub === 'next-number') {
    log(await nextDecisionNumber(root))
    return
  }

  if (sub === 'validate') {
    const target = arg ? path.resolve(root, arg) : undefined
    if (!target) {
      error('usage: haus decisions validate <path-to-decision.md>')
      process.exitCode = 1
      return
    }
    const result = await validateDecisionFile(target)
    if (!result.ok) {
      for (const e of result.errors) error(e)
      process.exitCode = 1
      return
    }
    log('valid')
  }
}

/** Alias entrypoints for `haus adr`. */
export const runAdr = runDecisions
