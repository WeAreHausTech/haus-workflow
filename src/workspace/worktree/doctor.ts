/**
 * `haus workspace worktree doctor [--from-hook]` — fast, side-effect-free health
 * check. No hashing, no installs. Intended to run in well under a second so it's
 * safe as the `SessionStart` hook's safety net (Task 5, not built in this task).
 *
 * Checks: are all configured members materialized in the current worktree; are
 * they on the expected branch; are they hydrated; are there orphaned member
 * worktrees whose workspace worktree directory is gone.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { WORKSPACE_FILE } from '../../commands/workspace/config.js'
import { resolveRoots } from '../../utils/git-root.js'
import { readMembers, REPOS_MANIFEST_FILE } from '../members.js'

import { currentBranch, listWorktrees } from './git-worktree.js'
import { readWorktreeState, worktreesDir } from './state.js'

export type MemberDoctorCheck = {
  id: string
  folder: string
  materialized: boolean
  expectedBranch?: string
  actualBranch?: string
  branchMismatch: boolean
  hydrated: boolean
}

export type DoctorReport = {
  isWorkspace: boolean
  inWorkspaceWorktree: boolean
  slug?: string
  members: MemberDoctorCheck[]
  orphans: string[]
  problems: string[]
}

const HYDRATION_MARKERS = ['node_modules', 'vendor', 'obj', 'bin']

function looksHydrated(memberPath: string): boolean {
  return HYDRATION_MARKERS.some((marker) => existsSync(path.join(memberPath, marker)))
}

export async function runDoctor(): Promise<DoctorReport> {
  const rootInfo = await resolveRoots()
  if (!rootInfo.isGitRepo) {
    return {
      isWorkspace: false,
      inWorkspaceWorktree: false,
      members: [],
      orphans: [],
      problems: ['Not inside a git repository.'],
    }
  }

  const workspaceRoot = rootInfo.mainRoot
  const isWorkspace =
    existsSync(path.join(workspaceRoot, WORKSPACE_FILE)) ||
    existsSync(path.join(workspaceRoot, REPOS_MANIFEST_FILE))
  if (!isWorkspace) {
    return {
      isWorkspace: false,
      inWorkspaceWorktree: false,
      members: [],
      orphans: [],
      problems: [
        `Not a haus workspace — no ${WORKSPACE_FILE} or ${REPOS_MANIFEST_FILE} at ${workspaceRoot}.`,
      ],
    }
  }

  const wsWorktreesDir = worktreesDir(workspaceRoot)
  const underWorktreesDir = rootInfo.repoRoot.startsWith(`${wsWorktreesDir}${path.sep}`)
  const inWorkspaceWorktree = rootInfo.isLinkedWorktree && underWorktreesDir

  const members = await readMembers(rootInfo)
  const problems: string[] = []
  const memberChecks: MemberDoctorCheck[] = []
  let slug: string | undefined

  if (inWorkspaceWorktree) {
    const wtPath = rootInfo.repoRoot
    slug = rootInfo.worktreeName ?? path.basename(wtPath)
    const state = await readWorktreeState(wtPath)

    for (const member of members) {
      const memberPath = path.join(wtPath, member.folder)
      const materialized = existsSync(memberPath)
      const expectedBranch =
        state?.members.find((m) => m.folder === member.folder)?.branch ?? state?.branch
      const actualBranch = materialized ? await currentBranch(memberPath) : undefined
      const branchMismatch = Boolean(
        expectedBranch && actualBranch && expectedBranch !== actualBranch,
      )
      const hydrated = materialized && looksHydrated(memberPath)

      memberChecks.push({
        id: member.id,
        folder: member.folder,
        materialized,
        expectedBranch,
        actualBranch,
        branchMismatch,
        hydrated,
      })

      if (!materialized) problems.push(`${member.id}: not materialized in this worktree.`)
      else if (branchMismatch) {
        problems.push(`${member.id}: on branch "${actualBranch}", expected "${expectedBranch}".`)
      } else if (!hydrated) {
        problems.push(
          `${member.id}: materialized but not hydrated (no node_modules/vendor/obj/bin). ` +
            'Run `haus workspace worktree hydrate` to fix.',
        )
      }
    }
  }

  // Orphan check: a member worktree registered in the member's own git pointing at
  // a `.claude/worktrees/<slug>/...` path whose `<slug>` directory no longer exists.
  const orphans: string[] = []
  for (const member of members) {
    const entries = await listWorktrees(member.absPath)
    for (const entry of entries) {
      const marker = `${path.sep}.claude${path.sep}worktrees${path.sep}`
      const idx = entry.path.indexOf(marker)
      if (idx === -1) continue
      const rest = entry.path.slice(idx + marker.length)
      const slugName = rest.split(path.sep)[0]
      if (!slugName) continue
      if (!existsSync(path.join(wsWorktreesDir, slugName))) {
        orphans.push(
          `${member.id}: worktree registered at ${entry.path} but ${path.join(wsWorktreesDir, slugName)} no longer exists — run \`git -C "${member.absPath}" worktree prune\`.`,
        )
      }
    }
  }
  if (orphans.length > 0) problems.push(...orphans)

  return { isWorkspace: true, inWorkspaceWorktree, slug, members: memberChecks, orphans, problems }
}
