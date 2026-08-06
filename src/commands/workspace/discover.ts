/**
 * Auto-discovery of member repos under a workspace root.
 *
 * One `fast-glob` pass finds repo markers (`.git`, `package.json`, `composer.json`,
 * `*.csproj`/`*.sln`/`*.fsproj`, `pom.xml`/`build.gradle*`, `Gemfile`),
 * collapses them to their owning directory, drops monorepo sub-packages (a manifest
 * dir nested under another repo root is part of that repo, not its own repo), and
 * resolves a best-effort role via a `fast` scan (advisory/display-only — when the scan
 * detects multiple roles, e.g. a fullstack repo with both `express-service` and
 * `react-app` signals, they are joined with `+` rather than keeping only the first
 * alphabetically-sorted one). Results merge into an existing `haus.workspace.yaml` by
 * `path` — user-edited `name`/`role` and top-level `relationships`/`client` are
 * preserved, new repos are appended, nothing is deleted.
 *
 * Risk guards: `followSymbolicLinks:false` (symlink cycles), `deep:maxDepth`
 * (deep monorepos), and `node_modules`/`vendor`/`dist`/`.haus-workflow` ignores for
 * the manifest-marker glob (the `.git`-marker glob deliberately has no `.git/**`
 * ignore of its own — see the comment above `GIT_MARKER`/`MANIFEST_MARKERS`).
 */
import path from 'node:path'

import fg from 'fast-glob'
import YAML from 'yaml'

import { scanProject } from '../../scanner/scan-project.js'
import { mapWithConcurrency, readJson, readText, writeText } from '../../utils/fs.js'
import { error, log } from '../../utils/logger.js'

import { parseWorkspaceConfig, type RepoEntry, type WorkspaceConfig } from './config.js'

export type { RepoEntry, WorkspaceConfig } from './config.js'

export type DiscoveredRepo = {
  name: string
  /** Path relative to the workspace root, posix-separated (derived from fast-glob / path.posix). */
  path: string
  /**
   * Best-effort role label, advisory/display-only (not consumed by `workspace setup`'s
   * per-repo `runSetupCore`, which re-scans each repo independently for the real
   * role-set). When the scan detects more than one role — e.g. a fullstack repo with
   * both `express-service` and `react-app` signals — every detected role is joined
   * with `+` rather than silently keeping only the first alphabetically-sorted one.
   */
  role: string
}

export type DiscoverOptions = {
  maxDepth?: number
  write?: boolean
  json?: boolean
  client?: string
}

const DEFAULT_MAX_DEPTH = 3
// Split into two glob passes (not one combined REPO_MARKERS list) specifically so
// each pass can use the ignore list that's actually safe for it:
// - GIT_MARKER alone, with NO '**/.git/**' ignore — that pattern also excludes the
//   bare '**/.git' match itself (fast-glob/micromatch treats `dir` and `dir/**` as
//   overlapping for ignore purposes), silently undercounting `.git`-only repos.
//   Same pitfall, same fix as src/utils/fs.ts's findNestedRepoDirs().
// - MANIFEST_MARKERS, WITH a '**/.git/**' ignore — these patterns (package.json,
//   *.csproj, etc.) can never legitimately match inside a repo's own `.git`
//   object store, so excluding it here is pure win: no ignore-vs-match ambiguity
//   (nothing we want lives at exactly path `.git`), and it stops fast-glob from
//   walking `.git/objects/**` hunting for a match that will never be found there.
const GIT_MARKER = ['**/.git']
const MANIFEST_MARKERS = [
  '**/package.json',
  '**/composer.json',
  '**/*.csproj',
  '**/*.sln',
  '**/*.fsproj', // .NET
  '**/pom.xml',
  '**/build.gradle*', // Java
  '**/Gemfile', // Ruby
]
const IGNORE = ['**/node_modules/**', '**/vendor/**', '**/dist/**', '**/.haus-workflow/**']

/** True when `child` is a strict descendant of `ancestor` (both repo-relative posix paths). */
function isDescendant(child: string, ancestor: string): boolean {
  if (ancestor === '.') return child !== '.'
  return child === ancestor ? false : child.startsWith(`${ancestor}/`)
}

/**
 * Finds independent repo roots under `workspaceRoot` — the cheap glob-and-collapse
 * step of discovery, with no per-repo `scanProject()` call. Split out from
 * `discoverRepos()` specifically so `hasMultipleSiblingRepos()`
 * (`src/scanner/sibling-repos.ts`) — a supplementary hint checked on every plain
 * `haus scan`/`setup-project` run — never pays for a role scan of every discovered
 * repo just to decide whether to print a one-line suggestion.
 *
 * @param workspaceRoot - Absolute path to the workspace root.
 * @param maxDepth - Max directory depth to traverse (default 3).
 * @returns Repo-relative posix paths (`.` for the workspace root itself, if it has its own marker).
 */
export async function findRepoRoots(
  workspaceRoot: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): Promise<string[]> {
  const commonOpts = {
    cwd: workspaceRoot,
    dot: true,
    onlyFiles: false,
    deep: maxDepth,
    followSymbolicLinks: false,
    // Discovery walks arbitrary directories under the workspace root; an
    // unreadable subtree (EPERM/EACCES) must be skipped, not abort the whole scan.
    suppressErrors: true,
  } as const
  const [gitMatches, manifestMatches] = await Promise.all([
    fg(GIT_MARKER, { ...commonOpts, ignore: IGNORE }),
    fg(MANIFEST_MARKERS, { ...commonOpts, ignore: [...IGNORE, '**/.git/**'] }),
  ])

  // Collapse each marker to its owning directory (posix-relative to the workspace root).
  const gitDirs = new Set<string>()
  const manifestDirs = new Set<string>()
  for (const match of gitMatches) {
    gitDirs.add(path.posix.dirname(match))
  }
  for (const match of manifestMatches) {
    manifestDirs.add(path.posix.dirname(match))
  }

  // A git dir is always a repo root. A manifest-only dir is a repo root only when no
  // shallower repo root already owns it (monorepo sub-packages collapse into the root).
  const repoRoots: string[] = [...gitDirs]
  const manifestSorted = [...manifestDirs].sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
  )
  for (const dir of manifestSorted) {
    if (gitDirs.has(dir)) continue
    if (repoRoots.some((root) => isDescendant(dir, root))) continue
    repoRoots.push(dir)
  }
  repoRoots.sort((a, b) => a.localeCompare(b))
  return repoRoots
}

/**
 * Discover member repos under `workspaceRoot`, with a best-effort advisory role
 * scan per repo (see `findRepoRoots()` if you only need the count/paths, not roles).
 *
 * @param workspaceRoot - Absolute path to the workspace root.
 * @param maxDepth - Max directory depth to traverse (default 3).
 */
export async function discoverRepos(
  workspaceRoot: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): Promise<DiscoveredRepo[]> {
  const repoRoots = await findRepoRoots(workspaceRoot, maxDepth)

  return mapWithConcurrency(repoRoots, async (relDir) => {
    const absDir = path.resolve(workspaceRoot, relDir)
    const pkg = await readJson<{ name?: unknown }>(path.join(absDir, 'package.json'))
    const name =
      typeof pkg?.name === 'string' && pkg.name.length > 0
        ? pkg.name
        : path.basename(relDir === '.' ? workspaceRoot : absDir)
    let role = 'auto'
    try {
      const scan = await scanProject(absDir)
      // scan.repoRoles is alphabetically sorted (finalizeRoles(), detection.ts) — taking
      // only [0] silently picked "express-service" over "react-app" for a fullstack repo
      // just because "e" < "r". This field is advisory/display-only, so join every
      // detected role instead of dropping all but the first.
      if (scan.repoRoles.length > 0) role = scan.repoRoles.join('+')
    } catch {
      // Best-effort: an unscannable repo still counts as a member, role stays 'auto'.
    }
    return { name, path: relDir === '.' ? '.' : relDir, role }
  })
}

/**
 * Merge discovered repos into an existing config by `path`.
 *
 * - Existing entries keep their user-edited `name`/`role` (discovery never clobbers).
 * - Repos present only in discovery are appended.
 * - Existing repos absent from discovery are preserved (never deleted).
 * - `client` comes from `opts.client` when supplied, else the existing value, else `unknown`.
 * - Top-level `relationships` are carried through untouched.
 */
export function mergeWorkspaceConfig(
  existing: WorkspaceConfig | undefined,
  discovered: DiscoveredRepo[],
  opts: { client?: string } = {},
): WorkspaceConfig {
  const existingRepos = existing?.repos ?? []
  const byPath = new Map(existingRepos.map((r) => [r.path, r]))
  for (const repo of discovered) {
    if (!byPath.has(repo.path)) {
      byPath.set(repo.path, { name: repo.name, path: repo.path, role: repo.role })
    }
  }
  // Preserve original ordering of existing repos, then appended discoveries in discovery order.
  const ordered: RepoEntry[] = []
  const seen = new Set<string>()
  for (const repo of existingRepos) {
    ordered.push(byPath.get(repo.path) as RepoEntry)
    seen.add(repo.path)
  }
  for (const repo of discovered) {
    if (seen.has(repo.path)) continue
    ordered.push(byPath.get(repo.path) as RepoEntry)
    seen.add(repo.path)
  }
  return {
    client: opts.client ?? existing?.client ?? 'unknown',
    repos: ordered,
    relationships: existing?.relationships ?? [],
  }
}

/** Render a {@link WorkspaceConfig} as `haus.workspace.yaml` text. */
export function renderWorkspaceYaml(config: WorkspaceConfig): string {
  return YAML.stringify({
    client: config.client,
    repos: config.repos.map((r) => ({ name: r.name, path: r.path, role: r.role ?? 'auto' })),
    relationships: config.relationships,
  })
}

/**
 * Orchestrates discovery: read existing yaml → discover → merge → render.
 * `--write` persists `haus.workspace.yaml`; otherwise the proposed yaml is printed.
 */
export async function runDiscover(
  workspaceRoot: string,
  opts: DiscoverOptions = {},
): Promise<void> {
  const yamlPath = path.join(workspaceRoot, 'haus.workspace.yaml')
  const existingText = await readText(yamlPath)
  const existing = parseWorkspaceConfig(existingText)
  // A present-but-unparseable yaml would be silently treated as "no existing config"
  // and clobbered on --write, dropping the user's client/relationships/edits. Refuse
  // rather than overwrite — the user must fix or remove the file first.
  if (existingText && !existing) {
    error(
      'Existing haus.workspace.yaml is malformed — fix or remove it before running discover (refusing to overwrite).',
    )
    process.exitCode = 1
    return
  }
  const discovered = await discoverRepos(workspaceRoot, opts.maxDepth ?? DEFAULT_MAX_DEPTH)
  if (discovered.length === 0) {
    error('No repos discovered under the workspace root.')
    process.exitCode = 1
    return
  }
  const merged = mergeWorkspaceConfig(existing, discovered, { client: opts.client })
  const yamlText = renderWorkspaceYaml(merged)

  if (opts.write) {
    await writeText(yamlPath, yamlText)
    if (opts.json) {
      // Single JSON document — include the write outcome instead of appending a
      // human line after it (which would make stdout non-parseable).
      log(JSON.stringify({ discovered, config: merged, wrote: yamlPath }, null, 2))
    } else {
      log(`Wrote ${merged.repos.length} repo(s) to haus.workspace.yaml`)
    }
    return
  }

  if (opts.json) {
    log(JSON.stringify({ discovered, config: merged }, null, 2))
    return
  }

  log('Proposed haus.workspace.yaml (run with --write to persist):\n')
  log(yamlText)
}
