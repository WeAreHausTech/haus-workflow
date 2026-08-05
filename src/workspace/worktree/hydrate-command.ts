/**
 * `haus workspace worktree hydrate` — re-run hydration for the *current*
 * workspace worktree (must be invoked from inside one; use `resolveRoots()` to
 * detect it, same as `add`'s own worktree-safety). Distinct from
 * `hydrateMember` (the per-member primitive in `./hydrate.ts`), this is the
 * command-level orchestrator: resolves which worktree "current" means, figures
 * out which members are actually materialized there, and fans hydration out
 * across them.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { mapWithConcurrency } from '../../utils/fs.js'
import { resolveRoots } from '../../utils/git-root.js'
import { readMembers } from '../members.js'

import { hydrateMember, type HydrationResult } from './hydrate.js'
import { selectMembers } from './select-members.js'
import { readWorktreeState, worktreesDir } from './state.js'

export type HydrateCommandOptions = {
  only?: string[]
  force?: boolean
  dryRun?: boolean
}

export type HydrateMemberResult = {
  member: string
  folder: string
  status: 'ok' | 'failed' | 'skipped' | 'planned'
  hydration?: HydrationResult
  error?: string
}

export type HydrateCommandResult =
  | { ok: false; error: string }
  | { ok: boolean; dryRun: boolean; slug: string; results: HydrateMemberResult[] }

export async function runHydrateWorktree(
  opts: HydrateCommandOptions,
): Promise<HydrateCommandResult> {
  const rootInfo = await resolveRoots()
  if (!rootInfo.isGitRepo || !rootInfo.isLinkedWorktree) {
    return {
      ok: false,
      error:
        'Run this from inside a workspace worktree created by `haus workspace worktree add` ' +
        '(.claude/worktrees/<slug>).',
    }
  }
  const workspaceRoot = rootInfo.mainRoot
  const wtPath = rootInfo.repoRoot
  if (!wtPath.startsWith(`${worktreesDir(workspaceRoot)}${path.sep}`)) {
    return {
      ok: false,
      error: "Current worktree is not one of this workspace's .claude/worktrees/<slug> checkouts.",
    }
  }

  const members = await readMembers(rootInfo)
  const { selected, unknown } = selectMembers(members, opts.only)
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown --only repo(s): ${unknown.join(', ')}` }
  }

  const state = await readWorktreeState(wtPath)
  const slug = state?.slug ?? path.basename(wtPath)

  if (opts.dryRun) {
    const results: HydrateMemberResult[] = selected.map((member) => {
      const memberPath = path.join(wtPath, member.folder)
      return {
        member: member.id,
        folder: member.folder,
        status: existsSync(memberPath) ? 'planned' : 'skipped',
        error: existsSync(memberPath) ? undefined : 'not materialized in this worktree',
      }
    })
    return { ok: true, dryRun: true, slug, results }
  }

  const results: HydrateMemberResult[] = []
  await mapWithConcurrency(selected, async (member) => {
    const memberPath = path.join(wtPath, member.folder)
    if (!existsSync(memberPath)) {
      results.push({
        member: member.id,
        folder: member.folder,
        status: 'skipped',
        error: 'not materialized in this worktree',
      })
      return
    }
    try {
      const hydration = await hydrateMember(member.absPath, memberPath, { force: opts.force })
      results.push({ member: member.id, folder: member.folder, status: 'ok', hydration })
    } catch (err) {
      results.push({
        member: member.id,
        folder: member.folder,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return { ok: results.every((r) => r.status !== 'failed'), dryRun: false, slug, results }
}
