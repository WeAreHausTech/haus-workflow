/**
 * `haus workspace worktree add <slug>` — orchestration. See
 * docs/plans/workspace-worktree-materialization.md — Task 4.
 *
 * Order: resolve workspace -> read members -> create the workspace worktree ->
 * create one member worktree per member (sequential — clearer partial-failure
 * reporting than interleaved parallel git output) -> hydrate + copy
 * machine-local files per successfully-materialized member (parallel — members
 * are independent once their worktree exists) -> persist `.haus-worktree.json`.
 *
 * Partial failure (plan doc pitfall #5): a failed member does NOT roll back
 * already-created worktrees (a member worktree can carry real, if incomplete,
 * value, and blowing it away risks discarding work a user might want to inspect).
 * Instead every member's exact status is recorded, `.haus-worktree.json` only
 * lists the members that actually materialized (so `list`/`doctor`/`remove` never
 * mistake a failed member for a present one), and the overall result's `ok` is
 * `false` whenever any member failed, so the CLI handler surfaces it as a
 * non-zero exit with the per-member detail — never a silent partial success.
 */
import path from 'node:path'

import fs from 'fs-extra'

import { mapWithConcurrency } from '../../utils/fs.js'
import { readMembers, type Member } from '../members.js'

import { addWorktree, branchExists, resolveDefaultBranch } from './git-worktree.js'
import { hydrateMember, type HydrationResult } from './hydrate.js'
import { copyMachineLocalFiles } from './local-files.js'
import { resolveWorkspaceForWorktree } from './root.js'
import { selectMembers } from './select-members.js'
import { worktreePath, writeWorktreeState, type WorktreeMemberState } from './state.js'

export type AddOptions = {
  slug: string
  branch?: string
  only?: string[]
  /** Default true; `--no-hydrate` sets this to `false`. */
  hydrate?: boolean
  dryRun?: boolean
}

export type MemberAddResult = {
  member: string
  folder: string
  status: 'ok' | 'failed' | 'planned'
  branch: string
  branchAction?: 'checkout' | 'create'
  startPoint?: string
  error?: string
  hydration?: HydrationResult
  localFilesCopied?: string[]
  durationMs: number
}

export type AddResult = {
  ok: boolean
  dryRun: boolean
  workspaceRoot: string
  slug: string
  branch: string
  worktreePath: string
  workspaceWorktree: { status: 'ok' | 'failed' | 'planned'; branchAction?: string; error?: string }
  members: MemberAddResult[]
}

export type AddOutcome = AddResult | { ok: false; error: string }

export async function runAdd(opts: AddOptions): Promise<AddOutcome> {
  const resolved = await resolveWorkspaceForWorktree()
  if (!resolved.ok) return { ok: false, error: resolved.reason }
  const { rootInfo, workspaceRoot } = resolved

  const allMembers = await readMembers(rootInfo)
  const { selected, unknown } = selectMembers(allMembers, opts.only)
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown --only repo(s): ${unknown.join(', ')}` }
  }

  const branch = opts.branch ?? opts.slug
  const wsWorktreePath = worktreePath(workspaceRoot, opts.slug)

  if (await fs.pathExists(wsWorktreePath)) {
    return {
      ok: false,
      error:
        `Workspace worktree already exists at ${wsWorktreePath} — run ` +
        '`haus workspace worktree hydrate` or `remove` first.',
    }
  }

  if (opts.dryRun) {
    return runDryRun({ workspaceRoot, wsWorktreePath, slug: opts.slug, branch, selected })
  }

  // 1. Workspace worktree, mirrored branch.
  const wsOutcome = await addWorktree(workspaceRoot, wsWorktreePath, branch)
  if (!wsOutcome.ok) {
    return {
      ok: false,
      error: wsOutcome.checkedOutElsewhere
        ? `Branch "${branch}" is already checked out elsewhere in the workspace repo — pick a different --branch.`
        : `Failed to create the workspace worktree: ${wsOutcome.stderr ?? 'unknown error'}`,
    }
  }

  // 2. One worktree per member.
  const memberResults: MemberAddResult[] = []
  for (const member of selected) {
    const start = Date.now()
    const memberWorktreePath = path.join(wsWorktreePath, member.folder)
    const outcome = await addWorktree(member.absPath, memberWorktreePath, branch, {
      preferDefaultBranchFrom: true,
    })
    if (!outcome.ok) {
      memberResults.push({
        member: member.id,
        folder: member.folder,
        status: 'failed',
        branch,
        branchAction: outcome.branchAction,
        error: outcome.checkedOutElsewhere
          ? `Branch "${branch}" is already checked out elsewhere in ${member.id} — pick a different --branch.`
          : (outcome.stderr ?? 'unknown error'),
        durationMs: Date.now() - start,
      })
      continue
    }
    memberResults.push({
      member: member.id,
      folder: member.folder,
      status: 'ok',
      branch,
      branchAction: outcome.branchAction,
      startPoint: outcome.startPoint,
      durationMs: Date.now() - start,
    })
  }

  // 3. Hydrate + copy machine-local files, in parallel, for members that materialized.
  const okResults = memberResults.filter((m) => m.status === 'ok')
  await mapWithConcurrency(okResults, async (result) => {
    const member = selected.find((m) => m.id === result.member)
    if (!member) return
    const memberWorktreePath = path.join(wsWorktreePath, member.folder)
    const hydrationStart = Date.now()
    if (opts.hydrate !== false) {
      result.hydration = await hydrateMember(member.absPath, memberWorktreePath)
    }
    result.localFilesCopied = await copyMachineLocalFiles(member.absPath, memberWorktreePath)
    result.durationMs += Date.now() - hydrationStart
  })

  // 4. Persist state for list/remove/doctor — only the members that actually materialized.
  const stateMembers: WorktreeMemberState[] = okResults.map((m) => ({
    id: m.member,
    folder: m.folder,
    branch: m.branch,
  }))
  await writeWorktreeState(wsWorktreePath, {
    slug: opts.slug,
    branch,
    createdAt: new Date().toISOString(),
    members: stateMembers,
  })

  const anyFailed = memberResults.some((m) => m.status === 'failed')
  return {
    ok: !anyFailed,
    dryRun: false,
    workspaceRoot,
    slug: opts.slug,
    branch,
    worktreePath: wsWorktreePath,
    workspaceWorktree: { status: 'ok', branchAction: wsOutcome.branchAction },
    members: memberResults,
  }
}

async function runDryRun(args: {
  workspaceRoot: string
  wsWorktreePath: string
  slug: string
  branch: string
  selected: Member[]
}): Promise<AddResult> {
  const { workspaceRoot, wsWorktreePath, slug, branch, selected } = args
  const wsBranchExists = await branchExists(workspaceRoot, branch)

  const members: MemberAddResult[] = []
  for (const member of selected) {
    const exists = await branchExists(member.absPath, branch)
    let startPoint: string | undefined
    if (!exists) {
      const def = await resolveDefaultBranch(member.absPath)
      startPoint = def?.ref
    }
    members.push({
      member: member.id,
      folder: member.folder,
      status: 'planned',
      branch,
      branchAction: exists ? 'checkout' : 'create',
      startPoint,
      durationMs: 0,
    })
  }

  return {
    ok: true,
    dryRun: true,
    workspaceRoot,
    slug,
    branch,
    worktreePath: wsWorktreePath,
    workspaceWorktree: { status: 'planned', branchAction: wsBranchExists ? 'checkout' : 'create' },
    members,
  }
}
