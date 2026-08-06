/**
 * Workspace-root resolution for `haus workspace worktree`.
 *
 * A workspace root is identified by the presence of `haus.workspace.yaml` and/or
 * `repos.manifest.json` at `resolveRoots().mainRoot` — the same bridge signal
 * `readMembers()` already uses (Task 3). Using `mainRoot` (not `repoRoot`) means
 * this resolves correctly even when invoked from inside a linked worktree (e.g. a
 * session already running inside `.claude/worktrees/<slug>`) — that is exactly
 * what Task 1's `resolveRoots()` exists for.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { WORKSPACE_FILE } from '../../commands/workspace/config.js'
import { resolveRoots, type RootInfo } from '../../utils/git-root.js'
import { REPOS_MANIFEST_FILE } from '../members.js'

export type WorkspaceRootResult =
  { ok: true; rootInfo: RootInfo; workspaceRoot: string } | { ok: false; reason: string }

/** Resolve the workspace root for worktree commands, or a clear reason it failed. */
export async function resolveWorkspaceForWorktree(start?: string): Promise<WorkspaceRootResult> {
  const rootInfo = await resolveRoots(start)
  if (!rootInfo.isGitRepo) {
    return { ok: false, reason: 'Not inside a git repository.' }
  }

  const workspaceRoot = rootInfo.mainRoot
  const hasYaml = existsSync(path.join(workspaceRoot, WORKSPACE_FILE))
  const hasManifest = existsSync(path.join(workspaceRoot, REPOS_MANIFEST_FILE))
  if (!hasYaml && !hasManifest) {
    return {
      ok: false,
      reason:
        `No workspace found at ${workspaceRoot} — expected ${WORKSPACE_FILE} or ` +
        `${REPOS_MANIFEST_FILE}. Run \`haus workspace discover --write\` or \`haus workspace init\` first.`,
    }
  }
  return { ok: true, rootInfo, workspaceRoot }
}
