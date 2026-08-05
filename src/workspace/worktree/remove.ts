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
  // (e.g. a hand-built worktree, or the state file got deleted).
  const memberFolders = state ? state.members.map((m) => m.folder) : allMembers.map((m) => m.folder)
  const targets: RemoveTarget[] = [
    { repo: '(workspace)', ownerRepo: workspaceRoot, path: wsWorktreePath },
  ]
  for (const folder of memberFolders) {
    const member = allMembers.find((m) => m.folder === folder)
    if (!member) continue
    targets.push({
      repo: member.id,
      ownerRepo: member.absPath,
      path: path.join(wsWorktreePath, folder),
    })
  }

  const existingTargets: RemoveTarget[] = []
  for (const target of targets) {
    if (await fs.pathExists(target.path)) existingTargets.push(target)
  }

  if (!opts.force) {
    const blockers: RemoveBlocker[] = []
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
        target.repo === '(workspace)' ? [WORKTREE_STATE_FILE, ...memberFolders] : []
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
