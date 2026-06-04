/**
 * Per-repo setup loop + workspace-root aggregate layer.
 *
 * Resolves the member repos from `haus.workspace.yaml`, runs the shared
 * {@link runSetupCore} pipeline once per repo (so each repo gets byte-identical
 * output to `haus setup-project`), then writes the workspace-root aggregate layer
 * (`writeWorkspaceArtifacts` + a workspace `CLAUDE.md`/`WORKSPACE.md`).
 *
 * Design constraints (per plan):
 * - **Sequential** loop — repos share the user-level catalog cache; concurrent
 *   writes would race. (Discovery's optional per-repo scan is concurrent; setup is not.)
 * - **Default-preview** — unlike single `setup-project` there is no interactive
 *   confirm(); writing requires explicit `--write` (mirrors `apply --write`).
 * - **Fail-fast by default**, `--continue-on-error` for resilient mode; every
 *   outcome is recorded in the returned statuses.
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import YAML from 'yaml'

import { writeWorkspaceClaudeMd } from '../../claude/write-workspace-claude-md.js'
import { readContextOrScan } from '../../scanner/read-context.js'
import type { ContextMap } from '../../types.js'
import { checkLock } from '../../update/lockfile.js'
import { readText } from '../../utils/fs.js'
import { error, log } from '../../utils/logger.js'
import { runSetupCore } from '../setup-core.js'

import { writeWorkspaceArtifacts, type WorkspaceRepoInput } from './aggregate.js'
import {
  buildManifest,
  readManifest,
  writeWorkspaceManifest,
  type ManifestRepoInput,
} from './manifest.js'

type RepoEntry = { name: string; path: string; role?: string }

type WorkspaceYaml = {
  client: string
  repos: RepoEntry[]
  relationships: unknown[]
}

export type WorkspaceSetupOptions = {
  mode?: 'guided' | 'fast'
  write?: boolean
  dryRun?: boolean
  json?: boolean
  continueOnError?: boolean
  /** Restrict the loop to repos with these names. */
  only?: string[]
}

export type RepoSetupStatus = {
  name: string
  path: string
  root: string
  status: 'ok' | 'failed'
  roles?: string[]
  recommendedCount?: number
  error?: string
}

export type WorkspaceSetupResult = {
  workspaceRoot: string
  statuses: RepoSetupStatus[]
  written: string[]
}

const WORKSPACE_FILE = 'haus.workspace.yaml'

/**
 * Resolve the workspace root by walking up from `start` until a directory
 * containing `haus.workspace.yaml` is found. Falls back to `start` when none is
 * found (the caller surfaces the missing-file error).
 */
export function resolveWorkspaceRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start)
  for (;;) {
    if (existsSync(path.join(dir, WORKSPACE_FILE))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return path.resolve(start)
    dir = parent
  }
}

function parseWorkspaceYaml(text: string): WorkspaceYaml | undefined {
  let parsed: unknown
  try {
    parsed = YAML.parse(text)
  } catch {
    // Malformed yaml — surface a friendly error upstream instead of a stack trace.
    return undefined
  }
  if (!parsed || typeof parsed !== 'object') return undefined
  const obj = parsed as Partial<WorkspaceYaml>
  // Validate repo entries up front so a bad shape can't crash `path.resolve` later.
  const repos = Array.isArray(obj.repos)
    ? (obj.repos as unknown[]).filter(
        (r): r is RepoEntry =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as RepoEntry).name === 'string' &&
          typeof (r as RepoEntry).path === 'string',
      )
    : []
  return {
    client: typeof obj.client === 'string' ? obj.client : 'unknown',
    repos,
    relationships: Array.isArray(obj.relationships) ? obj.relationships : [],
  }
}

/** True when `repoPath` resolves to the workspace root itself (`path: .`). */
function isRootRepo(workspaceRoot: string, repoPath: string): boolean {
  return path.resolve(workspaceRoot, repoPath) === path.resolve(workspaceRoot)
}

/**
 * Run the per-repo setup loop and write the workspace-root aggregate layer.
 *
 * @param workspaceRoot - Absolute path to the directory holding `haus.workspace.yaml`.
 * @param options - Loop behaviour flags.
 */
export async function runWorkspaceSetup(
  workspaceRoot: string,
  options: WorkspaceSetupOptions = {},
): Promise<WorkspaceSetupResult> {
  const mode = options.mode ?? 'fast'
  const apply = options.write ?? false
  const configText = await readText(path.join(workspaceRoot, WORKSPACE_FILE))
  if (!configText) {
    error(`Missing ${WORKSPACE_FILE}. Run \`haus workspace discover\` or \`init\` first.`)
    process.exitCode = 1
    return { workspaceRoot, statuses: [], written: [] }
  }
  const config = parseWorkspaceYaml(configText)
  if (!config || config.repos.length === 0) {
    error(`No repos configured in ${WORKSPACE_FILE}.`)
    process.exitCode = 1
    return { workspaceRoot, statuses: [], written: [] }
  }

  const onlySet = options.only && options.only.length > 0 ? new Set(options.only) : undefined
  const repos = onlySet ? config.repos.filter((r) => onlySet.has(r.name)) : config.repos

  const statuses: RepoSetupStatus[] = []
  const aggregateInputs: WorkspaceRepoInput[] = []

  for (const repo of repos) {
    const repoRoot = path.resolve(workspaceRoot, repo.path)
    log(`\n→ ${repo.name} (${repo.path})`)
    try {
      // Guard a misconfigured path (missing dir, or a file) before the scan
      // pipeline: handing a non-directory to fast-glob's cwd throws ENOTDIR on
      // Linux and surfaces as an unhandled rejection. A clean pre-check keeps the
      // failure recoverable (caught below) and consistent across platforms.
      if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
        throw new Error(`Repo path is not a directory: ${repo.path}`)
      }
      const res = await runSetupCore(repoRoot, {
        mode,
        json: options.json,
        apply,
        dryRun: options.dryRun,
      })
      statuses.push({
        name: repo.name,
        path: repo.path,
        root: repoRoot,
        status: 'ok',
        roles: res.roles,
        recommendedCount: res.recommendedCount,
      })
      // Reuse the cached context-map the pipeline just wrote (no re-scan).
      const context = (await readContextOrScan(repoRoot)) as ContextMap
      aggregateInputs.push({ name: repo.name, path: repo.path, context })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      statuses.push({
        name: repo.name,
        path: repo.path,
        root: repoRoot,
        status: 'failed',
        error: message,
      })
      if (!options.continueOnError) throw err
      error(`Setup failed for ${repo.name}: ${message}`)
    }
  }

  // Writing the aggregate layer requires --write (default is preview-only).
  const written: string[] = []
  if (apply && aggregateInputs.length > 0) {
    // Collision + member listing are derived from the FULL config, not the
    // (possibly `--only`-filtered) run set: a root repo (`path: .`) excluded by
    // `--only` must still force WORKSPACE.md so we never clobber its CLAUDE.md
    // (the workspace block reuses the same managed sentinels).
    const collision = config.repos.some((r) => isRootRepo(workspaceRoot, r.path))
    // The aggregate JSON/MD have no diff-only mode; under dryRun, skip them and
    // let writeWorkspaceClaudeMd preview the document diff without writing.
    if (!options.dryRun) {
      const artifacts = await writeWorkspaceArtifacts(
        workspaceRoot,
        aggregateInputs,
        config.relationships,
      )
      written.push(...artifacts)
    }
    const docPath = await writeWorkspaceClaudeMd(workspaceRoot, {
      client: config.client,
      members: config.repos.map((r) => ({ name: r.name, path: r.path })),
      collision,
      dryRun: options.dryRun,
    })
    written.push(docPath)
  }

  // Workspace manifest — derived/advisory record of per-repo setup state. Written
  // on --write (not dryRun). Records each processed repo's outcome; failures land
  // here only under --continue-on-error (fail-fast throws before this block). Repos
  // skipped this run (e.g. `--only`) carry forward their prior entry, else `pending`.
  if (apply && !options.dryRun) {
    const statusByName = new Map(statuses.map((s) => [s.name, s]))
    const prior = await readManifest(workspaceRoot)
    const priorByName = new Map((prior?.repos ?? []).map((r) => [r.name, r]))
    const manifestRepos: ManifestRepoInput[] = []
    for (const repo of config.repos) {
      const status = statusByName.get(repo.name)
      const role = repo.role ?? status?.roles?.[0] ?? 'auto'
      if (status?.status === 'ok') {
        const lock = await checkLock(path.resolve(workspaceRoot, repo.path))
        manifestRepos.push({
          name: repo.name,
          path: repo.path,
          role,
          status: 'ok',
          lockItemCount: lock.count,
          catalogRef: lock.catalogRef,
        })
      } else if (status?.status === 'failed') {
        manifestRepos.push({
          name: repo.name,
          path: repo.path,
          role,
          status: 'failed',
          lockItemCount: 0,
          catalogRef: null,
          error: status.error,
        })
      } else {
        // Not processed this run — preserve the prior entry verbatim, else pending.
        const carried = priorByName.get(repo.name)
        manifestRepos.push(
          carried
            ? {
                name: carried.name,
                path: carried.path,
                role: carried.role,
                status: carried.status,
                lockItemCount: carried.lockItemCount,
                catalogRef: carried.catalogRef,
                lastSetupAt: carried.lastSetupAt,
                hausVersionAtSetup: carried.hausVersionAtSetup,
                ...(carried.error ? { error: carried.error } : {}),
              }
            : {
                name: repo.name,
                path: repo.path,
                role,
                status: 'pending',
                lockItemCount: 0,
                catalogRef: null,
              },
        )
      }
    }
    const manifest = buildManifest({ client: config.client, repos: manifestRepos })
    const manifestFile = await writeWorkspaceManifest(workspaceRoot, manifest)
    written.push(manifestFile)
  }

  const ok = statuses.filter((s) => s.status === 'ok').length
  const failed = statuses.length - ok
  log(`\nWorkspace setup complete: ${ok} ok, ${failed} failed.`)
  return { workspaceRoot, statuses, written }
}
