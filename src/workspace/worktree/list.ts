/** `haus workspace worktree list` — enumerate `.claude/worktrees/*` and their member status. */
import path from 'node:path'

import fs from 'fs-extra'

import { currentBranch } from './git-worktree.js'
import { resolveWorkspaceForWorktree } from './root.js'
import { readWorktreeState, worktreesDir } from './state.js'

export type ListMemberEntry = {
  id: string
  folder: string
  expectedBranch?: string
  materialized: boolean
  actualBranch?: string
}

export type ListEntry = {
  slug: string
  branch: string
  createdAt?: string
  members: ListMemberEntry[]
}

export type ListResult =
  { ok: false; error: string } | { ok: true; workspaceRoot: string; worktrees: ListEntry[] }

export async function runList(): Promise<ListResult> {
  const resolved = await resolveWorkspaceForWorktree()
  if (!resolved.ok) return { ok: false, error: resolved.reason }
  const { workspaceRoot } = resolved

  const dir = worktreesDir(workspaceRoot)
  if (!(await fs.pathExists(dir))) return { ok: true, workspaceRoot, worktrees: [] }

  const entries = await fs.readdir(dir, { withFileTypes: true })
  const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

  const worktrees: ListEntry[] = []
  for (const slug of slugs) {
    const wtPath = path.join(dir, slug)
    const state = await readWorktreeState(wtPath)

    const members: ListMemberEntry[] = []
    for (const m of state?.members ?? []) {
      const memberPath = path.join(wtPath, m.folder)
      const materialized = await fs.pathExists(memberPath)
      const actualBranch = materialized ? await currentBranch(memberPath) : undefined
      members.push({
        id: m.id,
        folder: m.folder,
        expectedBranch: m.branch,
        materialized,
        actualBranch,
      })
    }

    worktrees.push({
      slug,
      branch: state?.branch ?? (await currentBranch(wtPath)) ?? 'unknown',
      createdAt: state?.createdAt,
      members,
    })
  }

  return { ok: true, workspaceRoot, worktrees }
}
