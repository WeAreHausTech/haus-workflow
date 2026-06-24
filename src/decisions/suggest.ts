import { isDecisionTriggered, runDecisionsCheck } from './check.js'
import { collectDiffStats } from './diff.js'
import { nextDecisionNumber } from './next-number.js'
import { resolveDecisionsDir, relativeDecisionPath } from './paths.js'

function draftTemplate(number: string, title: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `# ADR-${number}: ${title}

- **Status:** Proposed
- **Date:** ${today}
- **Decided by:** _(pending approval)_ (draft by haus decisions suggest)
- **Affects:** _(paths/components)_
- **Related:** _(PR/issue link)_

## Context

_(What problem or situation triggered this decision?)_

## Decision

_(One clear sentence: what we chose.)_

## Motivation (why)

_(Why this over alternatives — the line agents read for "why".)_

## Alternatives considered

- _(Alternative)_ — rejected because _(reason)_.

## Consequences

- _(Positive and negative follow-ons.)_
`
}

/** Emits a draft decision when the session diff is decision-worthy. */
export async function runDecisionsSuggest(
  root: string,
  opts: { fromHook?: boolean; title?: string } = {},
): Promise<void> {
  const stats = await collectDiffStats(root, { staged: true })
  const stagedCheck = await runDecisionsCheck(root, { staged: true })
  const unstagedStats = await collectDiffStats(root, {})
  const triggered = isDecisionTriggered(stats) || isDecisionTriggered(unstagedStats)

  if (!triggered) return

  if (stagedCheck.triggered && stagedCheck.satisfied) return

  const number = await nextDecisionNumber(root)
  const title = opts.title ?? 'Decision from current changes'
  const draft = draftTemplate(number, title)
  const decisionsDir = await resolveDecisionsDir(root)
  const rel = relativeDecisionPath(decisionsDir, root)
  const file = `${rel}/${number}-${
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'decision'
  }.md`

  const payload = {
    action: 'propose_decision',
    message:
      'Decision-worthy change detected. Draft an ADR from this template and ask the user to approve before writing.',
    file,
    draft,
    indexHint: `Add a row to ${rel}/README.md for ADR-${number}.`,
  }

  if (opts.fromHook) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
    return
  }
  process.stdout.write(`${draft}\n`)
}
