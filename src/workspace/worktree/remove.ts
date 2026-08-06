/**
 * `haus workspace worktree remove <slug>` — see
 * docs/plans/workspace-worktree-materialization.md — Task 4.
 *
 * Refuses by default when uncommitted or unpushed work is found anywhere in the
 * slug's worktrees (workspace worktree + every member) — the plan doc calls this
 * out explicitly as a WORKFLOW.md NEVER-rule-equivalent, not a nicety. Only
 * `--force` bypasses it. Removes members first, then the workspace worktree
 * (removing the workspace dir first would delete the member worktree
 * directories nested inside it before their own repos get to unregister them),
 * and prunes every touched repo afterward so no stale registration survives a
 * `git worktree list` (plan doc pitfall: registrations must not leak).
 */
import path from 'node:path'

import fs from 'fs-extra'

import { readMembers } from '../members.js'

import {
  hasUncommittedChanges,
  hasUnpushedWork,
  pruneWorktrees,
  removeWorktree,
} from './git-worktree.js'
import { resolveWorkspaceForWorktree } from './root.js'
import { readWorktreeState, worktreePath, WORKTREE_STATE_FILE } from './state.js'

export type RemoveOptions = {
  slug: string
  force?: boolean
  dryRun?: boolean
}

export type RemoveBlocker = { repo: string; reason: string }

export type RemoveResult =
  | { ok: false; error: string }
  | { ok: false; blocked: true; blockers: RemoveBlocker[] }
  | { ok: true; dryRun: true; slug: string; wouldRemove: string[] }
  | {
      ok: boolean
      dryRun: false
      slug: string
      removed: string[]
      failed: Array<{ repo: string; error: string }>
    }

type RemoveTarget = { repo: string; ownerRepo: string; path: string }

export async function runRemove(opts: RemoveOptions): Promise<RemoveResult> {
  const resolved = await resolveWorkspaceForWorktree()
  if (!resolved.ok) return { ok: false, error: resolved.reason }
  const { rootInfo, workspaceRoot } = resolved

  const wsWorktreePath = worktreePath(workspaceRoot, opts.slug)
  if (!(await fs.pathExists(wsWorktreePath))) {
    return { ok: false, error: `No workspace worktree found at ${wsWorktreePath}.` }
  }

  const state = await readWorktreeState(wsWorktreePath)
  const allMembers = await readMembers(rootInfo)

  // Prefer the recorded state (the exact set materialized at `add` time); fall
  // back to every currently configured member if the state file is missing
  // (e.g. a hand-built worktree, or the state file got deleted). Normalized to a
  // common shape up front so both branches (WorktreeMemberState vs. bare
  // Member) are handled identically below.
  const stateMembers: { id: string; folder: string; absPath?: string }[] =
    state?.members.map((m) => ({ id: m.id, folder: m.folder, absPath: m.absPath })) ??
    allMembers.map((m) => ({ id: m.id, folder: m.folder, absPath: m.absPath }))
  const targets: RemoveTarget[] = [
    { repo: '(workspace)', ownerRepo: workspaceRoot, path: wsWorktreePath },
  ]
  // Members that were materialized at `add` time but have since dropped out of
  // the workspace config (renamed/removed) — readMembers() no longer knows their
  // absPath, so their git worktree registration can't be located/unregistered
  // unless the state file itself captured absPath (added after this fix). Never
  // silently skip these: skipping meant their on-disk directory still got
  // deleted (nested under the workspace worktree root) while their registration
  // in the now-unreachable owning repo leaked forever, invisible to `doctor` too
  // (it also only ever looks at currently configured members).
  const unresolvedDroppedMembers: string[] = []
  for (const stateMember of stateMembers) {
    const configMember = allMembers.find((m) => m.folder === stateMember.folder)
    const ownerRepo = configMember?.absPath ?? stateMember.absPath
    if (!ownerRepo) {
      if (!configMember) unresolvedDroppedMembers.push(stateMember.folder)
      continue
    }
    targets.push({
      repo: configMember?.id ?? stateMember.id,
      ownerRepo,
      path: path.join(wsWorktreePath, stateMember.folder),
    })
  }

  const existingTargets: RemoveTarget[] = []
  for (const target of targets) {
    if (await fs.pathExists(target.path)) existingTargets.push(target)
  }

  if (!opts.force) {
    const blockers: RemoveBlocker[] = []
    // A dropped-from-config member with no recorded absPath can't be verified
    // (uncommitted work?) or unregistered — never proceed past this silently.
    for (const folder of unresolvedDroppedMembers) {
      blockers.push({
        repo: folder,
        reason:
          'no longer in the workspace config and this worktree predates absPath tracking — ' +
          'cannot verify for uncommitted work or unregister its git worktree; removing anyway ' +
          'will delete its directory here but leak the registration in whatever repo it came ' +
          'from (run `git worktree prune` there manually afterward)',
      })
    }
    for (const target of existingTargets) {
      // The workspace worktree root always contains two kinds of untracked-by-design
      // content that must not count as "uncommitted work" here: our own
      // `.haus-worktree.json` state file, and every member folder itself — each
      // member is a *separate* nested git repository, so from the workspace
      // repo's own git status they look like untracked embedded directories
      // (`?? forms/`) regardless of whether that member repo is actually clean.
      // Each member gets its own independent dirty-check as its own target below,
      // so excluding them here just avoids double-counting/false-flagging a member
      // repo's mere presence as if it were workspace-level uncommitted work.
      const ignorePaths =
        target.repo === '(workspace)'
          ? [WORKTREE_STATE_FILE, ...stateMembers.map((m) => m.folder)]
          : []
      if (await hasUncommittedChanges(target.path, ignorePaths)) {
        blockers.push({ repo: target.repo, reason: 'uncommitted changes' })
        continue
      }
      const unpushed = await hasUnpushedWork(target.path)
      if (unpushed.unpushed) blockers.push({ repo: target.repo, reason: unpushed.reason })
    }
    if (blockers.length > 0) return { ok: false, blocked: true, blockers }
  }

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      slug: opts.slug,
      wouldRemove: existingTargets.map((t) => t.repo),
    }
  }

  const removed: string[] = []
  const failed: Array<{ repo: string; error: string }> = []

  // Reached only under --force (the blocker loop above already returned otherwise).
  // Their directory still gets deleted below (nested under wsWorktreePath, cleaned
  // up by the belt-and-braces fs.remove()), but their git worktree registration in
  // whatever repo they came from cannot be unregistered without a known absPath —
  // surface that explicitly rather than reporting a silent, misleadingly clean result.
  for (const folder of unresolvedDroppedMembers) {
    failed.push({
      repo: folder,
      error:
        'directory removed, but its git worktree registration could not be unregistered ' +
        '(no recorded absPath) — run `git worktree prune` in its original owning repo',
    })
  }

  const memberTargets = existingTargets.filter((t) => t.repo !== '(workspace)')
  for (const target of memberTargets) {
    const result = await removeWorktree(target.ownerRepo, target.path)
    if (result.ok) removed.push(target.repo)
    else failed.push({ repo: target.repo, error: result.stderr ?? 'unknown error' })
    await pruneWorktrees(target.ownerRepo)
  }

  const wsTarget = existingTargets.find((t) => t.repo === '(workspace)')
  if (wsTarget) {
    const wsResult = await removeWorktree(workspaceRoot, wsWorktreePath)
    if (wsResult.ok) removed.push('(workspace)')
    else failed.push({ repo: '(workspace)', error: wsResult.stderr ?? 'unknown error' })
    await pruneWorktrees(workspaceRoot)
  }

  // Belt-and-braces: `git worktree remove` should already delete the directory;
  // if anything was left behind (e.g. a failed member left files under the
  // workspace worktree dir), clean it up so no half-torn-down worktree lingers.
  if (await fs.pathExists(wsWorktreePath)) {
    await fs.remove(wsWorktreePath)
  }

  return { ok: failed.length === 0, dryRun: false, slug: opts.slug, removed, failed }
}
