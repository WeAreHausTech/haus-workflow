/**
 * Auto-discovery of member repos under a workspace root.
 *
 * One `fast-glob` pass finds repo markers (`.git`, `package.json`, `composer.json`),
 * collapses them to their owning directory, drops monorepo sub-packages (a manifest
 * dir nested under another repo root is part of that repo, not its own repo), and
 * resolves a best-effort role via a `fast` scan. Results merge into an existing
 * `haus.workspace.yaml` by `path` — user-edited `name`/`role` and top-level
 * `relationships`/`client` are preserved, new repos are appended, nothing is deleted.
 *
 * Risk guards: `followSymbolicLinks:false` (symlink cycles), `deep:maxDepth`
 * (deep monorepos), and `node_modules`/`.git`/`vendor`/`dist`/`.haus-workflow` ignores.
 */
import path from 'node:path'

import fg from 'fast-glob'
import YAML from 'yaml'

import { scanProject } from '../../scanner/scan-project.js'
import { mapWithConcurrency, readJson, readText, writeText } from '../../utils/fs.js'
import { error, log } from '../../utils/logger.js'

export type DiscoveredRepo = {
  name: string
  /** Path relative to the workspace root (posix-style separators preserved by path.join). */
  path: string
  role: string
}

export type RepoEntry = {
  name: string
  path: string
  role?: string
}

export type WorkspaceConfig = {
  client: string
  repos: RepoEntry[]
  relationships: unknown[]
}

export type DiscoverOptions = {
  maxDepth?: number
  write?: boolean
  dryRun?: boolean
  json?: boolean
  client?: string
}

const DEFAULT_MAX_DEPTH = 3
const REPO_MARKERS = ['**/.git', '**/package.json', '**/composer.json']
const IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/vendor/**',
  '**/dist/**',
  '**/.haus-workflow/**',
]

/** True when `child` is a strict descendant of `ancestor` (both repo-relative posix paths). */
function isDescendant(child: string, ancestor: string): boolean {
  if (ancestor === '.') return child !== '.'
  return child === ancestor ? false : child.startsWith(`${ancestor}/`)
}

/**
 * Discover member repos under `workspaceRoot`.
 *
 * @param workspaceRoot - Absolute path to the workspace root.
 * @param maxDepth - Max directory depth to traverse (default 3).
 */
export async function discoverRepos(
  workspaceRoot: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): Promise<DiscoveredRepo[]> {
  const matches = await fg(REPO_MARKERS, {
    cwd: workspaceRoot,
    dot: true,
    onlyFiles: false,
    deep: maxDepth,
    followSymbolicLinks: false,
    ignore: IGNORE,
  })

  // Collapse each marker to its owning directory (posix-relative to the workspace root).
  const gitDirs = new Set<string>()
  const manifestDirs = new Set<string>()
  for (const match of matches) {
    const base = path.posix.basename(match)
    const dir = path.posix.dirname(match)
    const owner = dir === '.' ? '.' : dir
    if (base === '.git') gitDirs.add(owner)
    else manifestDirs.add(owner)
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

  return mapWithConcurrency(repoRoots, async (relDir) => {
    const absDir = path.resolve(workspaceRoot, relDir)
    const pkg = await readJson<{ name?: unknown }>(path.join(absDir, 'package.json'))
    const name =
      typeof pkg?.name === 'string' && pkg.name.length > 0
        ? pkg.name
        : path.basename(relDir === '.' ? workspaceRoot : absDir)
    let role = 'auto'
    try {
      const scan = await scanProject(absDir, 'fast')
      if (scan.repoRoles[0]) role = scan.repoRoles[0]
    } catch {
      // Best-effort: an unscannable repo still counts as a member, role stays 'auto'.
    }
    return { name, path: relDir === '.' ? '.' : relDir, role }
  })
}

function parseWorkspaceYaml(text: string | undefined): WorkspaceConfig | undefined {
  if (!text) return undefined
  const parsed = YAML.parse(text) as Partial<WorkspaceConfig> | null
  if (!parsed || typeof parsed !== 'object') return undefined
  return {
    client: typeof parsed.client === 'string' ? parsed.client : 'unknown',
    repos: Array.isArray(parsed.repos) ? parsed.repos : [],
    relationships: Array.isArray(parsed.relationships) ? parsed.relationships : [],
  }
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
  const existing = parseWorkspaceYaml(await readText(yamlPath))
  const discovered = await discoverRepos(workspaceRoot, opts.maxDepth ?? DEFAULT_MAX_DEPTH)
  if (discovered.length === 0) {
    error('No repos discovered under the workspace root.')
    process.exitCode = 1
    return
  }
  const merged = mergeWorkspaceConfig(existing, discovered, { client: opts.client })
  const yamlText = renderWorkspaceYaml(merged)

  if (opts.json) {
    log(JSON.stringify({ discovered, config: merged }, null, 2))
  }

  if (opts.write) {
    await writeText(yamlPath, yamlText)
    log(`Wrote ${merged.repos.length} repo(s) to haus.workspace.yaml`)
    return
  }

  if (!opts.json) {
    log('Proposed haus.workspace.yaml (run with --write to persist):\n')
    log(yamlText)
  }
}
