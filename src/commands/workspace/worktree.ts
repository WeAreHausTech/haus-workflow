/**
 * `haus workspace worktree` — thin handler. Real logic lives under
 * `src/workspace/worktree/*`. See docs/plans/workspace-worktree-materialization.md
 * — Task 4.
 */
import { error, log, warn } from '../../utils/logger.js'
import { runAdd, type AddOptions, type AddResult } from '../../workspace/worktree/add.js'
import { runDoctor } from '../../workspace/worktree/doctor.js'
import {
  runHydrateWorktree,
  type HydrateCommandOptions,
} from '../../workspace/worktree/hydrate-command.js'
import { runList } from '../../workspace/worktree/list.js'
import { runRemove, type RemoveOptions } from '../../workspace/worktree/remove.js'

export type WorktreeAction = 'add' | 'hydrate' | 'list' | 'remove' | 'doctor'

export type WorktreeCliOptions = {
  slug?: string
  branch?: string
  only?: string | string[]
  hydrate?: boolean
  force?: boolean
  dryRun?: boolean
  fromHook?: boolean
}

function normalizeOnly(only: WorktreeCliOptions['only']): string[] | undefined {
  if (!only) return undefined
  const list = Array.isArray(only) ? only : only.split(/[\s,]+/)
  const cleaned = list.map((s) => s.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned : undefined
}

function describeInstall(
  hydration: NonNullable<AddResult['members'][number]['hydration']>,
): string {
  if (hydration.install.plan.manager === 'none') return 'no install step (no recognized lockfile)'
  if (!hydration.install.ran)
    return `install skipped (${hydration.install.skippedReason ?? 'unavailable'})`
  return hydration.install.ok
    ? `hydrated via ${hydration.install.plan.manager}`
    : `install FAILED via ${hydration.install.plan.manager}`
}

async function handleAdd(opts: WorktreeCliOptions): Promise<void> {
  if (!opts.slug) {
    error('Usage: haus workspace worktree add <slug>')
    process.exitCode = 1
    return
  }
  const addOpts: AddOptions = {
    slug: opts.slug,
    branch: opts.branch,
    only: normalizeOnly(opts.only),
    hydrate: opts.hydrate !== false,
    dryRun: Boolean(opts.dryRun),
  }
  const result = await runAdd(addOpts)
  if ('error' in result) {
    error(result.error)
    process.exitCode = 1
    return
  }

  if (result.dryRun) {
    log(
      `[dry-run] Would create the workspace worktree at ${result.worktreePath} on branch ` +
        `"${result.branch}" (${result.workspaceWorktree.branchAction}).`,
    )
    for (const m of result.members) {
      log(
        `[dry-run]   ${m.member} (${m.folder}): ${m.branchAction}${m.startPoint ? ` from ${m.startPoint}` : ''}`,
      )
    }
    return
  }

  log(
    `Workspace worktree "${result.slug}" ready at ${result.worktreePath} ` +
      `(branch "${result.branch}", ${result.workspaceWorktree.branchAction}).`,
  )
  for (const m of result.members) {
    if (m.status === 'ok') {
      const hydrationNote = m.hydration
        ? describeInstall(m.hydration)
        : 'not hydrated (--no-hydrate)'
      log(`  ${m.member}: ${m.branchAction} "${m.branch}" — ${hydrationNote} (${m.durationMs}ms)`)
    } else {
      warn(`  ${m.member}: FAILED — ${m.error}`)
    }
  }
  if (!result.ok) {
    const failedCount = result.members.filter((m) => m.status === 'failed').length
    error(
      `${failedCount} member(s) failed to materialize — the worktree is partially built. ` +
        'See the per-member detail above for exactly what exists.',
    )
    process.exitCode = 1
  }
}

async function handleHydrate(opts: WorktreeCliOptions): Promise<void> {
  const hydrateOpts: HydrateCommandOptions = {
    only: normalizeOnly(opts.only),
    force: Boolean(opts.force),
    dryRun: Boolean(opts.dryRun),
  }
  const result = await runHydrateWorktree(hydrateOpts)
  if (!result.ok && 'error' in result) {
    error(result.error)
    process.exitCode = 1
    return
  }
  if (result.dryRun) {
    log(`[dry-run] Would hydrate "${result.slug}":`)
    for (const r of result.results)
      log(`[dry-run]   ${r.member}: ${r.status}${r.error ? ` (${r.error})` : ''}`)
    return
  }
  log(`Hydrated "${result.slug}":`)
  for (const r of result.results) {
    if (r.status === 'ok' && r.hydration) log(`  ${r.member}: ${describeInstall(r.hydration)}`)
    else warn(`  ${r.member}: ${r.status}${r.error ? ` — ${r.error}` : ''}`)
  }
  if (!result.ok) process.exitCode = 1
}

async function handleRemove(opts: WorktreeCliOptions): Promise<void> {
  if (!opts.slug) {
    error('Usage: haus workspace worktree remove <slug>')
    process.exitCode = 1
    return
  }
  const removeOpts: RemoveOptions = {
    slug: opts.slug,
    force: Boolean(opts.force),
    dryRun: Boolean(opts.dryRun),
  }
  const result = await runRemove(removeOpts)

  if (!result.ok && 'error' in result) {
    error(result.error)
    process.exitCode = 1
    return
  }
  if (!result.ok && 'blocked' in result && result.blocked) {
    error(`Refusing to remove "${opts.slug}" — uncommitted or unpushed work found:`)
    for (const b of result.blockers) error(`  ${b.repo}: ${b.reason}`)
    error('Re-run with --force to remove anyway.')
    process.exitCode = 1
    return
  }
  if ('dryRun' in result && result.dryRun) {
    log(`[dry-run] Would remove: ${result.wouldRemove.join(', ') || '(nothing)'}`)
    return
  }
  if ('removed' in result) {
    log(`Removed: ${result.removed.join(', ') || '(nothing)'}`)
    if (result.failed.length > 0) {
      for (const f of result.failed) error(`  Failed to remove ${f.repo}: ${f.error}`)
      process.exitCode = 1
    }
  }
}

async function handleList(): Promise<void> {
  const result = await runList()
  if (!result.ok) {
    error(result.error)
    process.exitCode = 1
    return
  }
  if (result.worktrees.length === 0) {
    log('No workspace worktrees under .claude/worktrees/.')
    return
  }
  for (const wt of result.worktrees) {
    log(`${wt.slug}  (branch: ${wt.branch})`)
    for (const m of wt.members) {
      const status = m.materialized ? `ok, branch ${m.actualBranch ?? 'unknown'}` : 'MISSING'
      log(`  ${m.id}: ${status}`)
    }
  }
}

async function handleDoctor(opts: WorktreeCliOptions): Promise<void> {
  try {
    const report = await runDoctor()
    if (!report.isWorkspace) {
      if (!opts.fromHook) {
        warn(report.problems[0] ?? 'Not a haus workspace.')
        process.exitCode = 1
      }
      return
    }
    if (report.problems.length === 0) {
      log(
        report.inWorkspaceWorktree
          ? `Workspace worktree "${report.slug}" looks healthy.`
          : 'No issues found.',
      )
      return
    }
    for (const p of report.problems) warn(p)
    if (!opts.fromHook) process.exitCode = 1
  } catch (err) {
    // --from-hook must never fail a session start — report but never exit non-zero.
    const message = err instanceof Error ? err.message : String(err)
    if (opts.fromHook) {
      warn(`worktree doctor: ${message}`)
    } else {
      error(message)
      process.exitCode = 1
    }
  }
}

export async function runWorktree(
  action: WorktreeAction,
  opts: WorktreeCliOptions = {},
): Promise<void> {
  switch (action) {
    case 'add':
      return handleAdd(opts)
    case 'hydrate':
      return handleHydrate(opts)
    case 'remove':
      return handleRemove(opts)
    case 'list':
      return handleList()
    case 'doctor':
      return handleDoctor(opts)
  }
}
