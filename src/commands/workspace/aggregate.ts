/**
 * Workspace-root aggregate layer.
 *
 * Builds the cross-repo view from the per-repo {@link ContextMap}s gathered during
 * a workspace setup loop (no re-scan). Writes four artifacts under the workspace
 * root's `.haus-workflow/`:
 *
 * - `workspace-summary.json` — per-repo roles / package manager / deps.
 * - `dependency-ownership-map.json` — `dep → [repoName]` ownership index.
 * - `cross-repo-summary.md` — human one-pager (imported by the workspace CLAUDE.md).
 * - `workspace-context-map.json` — role union, merged cross-repo hints, per-repo
 *   table, and the yaml `relationships[]` passed straight through.
 *
 * Everything resolves against an explicit `workspaceRoot` via `hausPath`, so the
 * `scan` and `setup` commands can share this writer without cwd assumptions.
 */
import type { ContextMap } from '../../types.js'
import { writeJson, writeText } from '../../utils/fs.js'
import { hausPath } from '../../utils/paths.js'

/** A member repo plus the context map produced for it during the setup loop. */
export type WorkspaceRepoInput = {
  name: string
  /** Path relative to the workspace root. */
  path: string
  /** The repo's ContextMap (subset used here; full ScanResult is also accepted). */
  context: Pick<
    ContextMap,
    'repoName' | 'repoRoles' | 'packageManager' | 'dependencies' | 'crossRepoHints'
  >
}

/**
 * Write the workspace-root aggregate artifacts derived from `repos`.
 *
 * @param workspaceRoot - Absolute path to the directory holding `haus.workspace.yaml`.
 * @param repos - Per-repo contexts gathered by the setup loop (already scanned).
 * @param relationships - Raw `relationships[]` from the workspace yaml, passed through.
 * @returns Absolute paths of the artifacts written.
 */
export async function writeWorkspaceArtifacts(
  workspaceRoot: string,
  repos: WorkspaceRepoInput[],
  relationships: unknown[] = [],
): Promise<string[]> {
  const summaries = repos.map((repo) => ({
    name: repo.name,
    path: repo.path,
    roles: repo.context.repoRoles ?? [],
    packageManager: repo.context.packageManager,
    deps: repo.context.dependencies ?? [],
  }))

  const ownership: Record<string, string[]> = {}
  for (const repo of summaries) {
    for (const dep of repo.deps) {
      ownership[dep] ??= []
      ownership[dep].push(repo.name)
    }
  }

  const roles = [...new Set(summaries.flatMap((r) => r.roles))].sort()
  const crossRepoHints = [...new Set(repos.flatMap((r) => r.context.crossRepoHints ?? []))].sort()

  const summaryPath = hausPath(workspaceRoot, 'workspace-summary.json')
  const ownershipPath = hausPath(workspaceRoot, 'dependency-ownership-map.json')
  const crossRepoPath = hausPath(workspaceRoot, 'cross-repo-summary.md')
  const contextMapPath = hausPath(workspaceRoot, 'workspace-context-map.json')

  await writeJson(summaryPath, {
    generatedAt: new Date().toISOString(),
    repos: summaries,
  })
  await writeJson(ownershipPath, ownership)
  await writeText(
    crossRepoPath,
    `# Cross Repo Summary\n\n${summaries
      .map(
        (repo) =>
          `- ${repo.name} (${repo.path}) roles: ${repo.roles.join(', ') || 'unknown'}; package manager: ${repo.packageManager}`,
      )
      .join('\n')}\n`,
  )
  await writeJson(contextMapPath, {
    generatedAt: new Date().toISOString(),
    roles,
    crossRepoHints,
    repos: summaries.map((r) => ({
      name: r.name,
      path: r.path,
      roles: r.roles,
      packageManager: r.packageManager,
    })),
    relationships,
  })

  return [summaryPath, ownershipPath, crossRepoPath, contextMapPath]
}
