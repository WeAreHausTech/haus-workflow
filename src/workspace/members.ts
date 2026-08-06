/**
 * Shared member-repo read layer for workspace commands.
 *
 * Bridges the two config sources a workspace may carry: `haus.workspace.yaml`
 * (the CLI's own cross-repo-ops config — already code-read by `discover`/`scan`/
 * `setup`/`doctor` via `../commands/workspace/config.ts`) and `repos.manifest.json`
 * (today read only by the `project:clone` Claude Code skill's prose, never by CLI
 * code). `readMembers()` normalizes either into one `Member[]` shape so future code
 * (Task 4's worktree materialization, `src/workspace/worktree/`) has a single thing
 * to consume instead of two.
 *
 * This is the "bridge now" decision, not a consolidation: no migration is offered
 * for existing workspaces, and the two files keep their separate, pre-existing
 * meanings. See docs/plans/workspace-worktree-materialization.md (Task 3) and
 * docs/decisions/0026-workspace-member-config-bridge-not-consolidation.md.
 *
 * Precedence when both files are present: `haus.workspace.yaml` wins outright —
 * it is already the config every `haus workspace <subcommand>` treats as
 * authoritative, while `repos.manifest.json` is currently only a clone-time
 * ingredient list. There is no merge across the two sources.
 *
 * `repos.local.json`'s `pathOverrides` (`folder` -> absolute path) applies on top
 * of whichever source wins, same as the `project:clone` skill already honors it.
 *
 * Tolerant on read, strict on write (this module never writes): a config file
 * that exists but fails to parse or has the wrong shape throws
 * {@link MemberConfigError} rather than returning an empty list — callers must
 * never mistake "couldn't read the config" for "workspace genuinely has no
 * members". An empty array is returned only when neither config file exists at
 * all.
 */
import path from 'node:path'

import { parseWorkspaceConfig, WORKSPACE_FILE } from '../commands/workspace/config.js'
import { readJsonDetailed, readText } from '../utils/fs.js'
import type { RootInfo } from '../utils/git-root.js'

/** Which config file a given {@link Member} was read from. */
export type MemberSource = 'haus.workspace.yaml' | 'repos.manifest.json'

/** A normalized workspace member repo, regardless of which config file described it. */
export type Member = {
  /** Stable identifier — `name` from `haus.workspace.yaml`, `id` from `repos.manifest.json`. */
  id: string
  /** Path relative to the workspace root. */
  folder: string
  /** Git remote URL, when the source config carries one (`repos.manifest.json` only today). */
  url?: string
  /** Resolved against `rootInfo.mainRoot`, honoring a `repos.local.json` `pathOverrides` entry. */
  absPath: string
  source: MemberSource
}

/** `repos.manifest.json` filename, resolved relative to the workspace root. */
export const REPOS_MANIFEST_FILE = 'repos.manifest.json'
/** `repos.local.json` filename, resolved relative to the workspace root. */
export const REPOS_LOCAL_FILE = 'repos.local.json'

/**
 * Thrown when a member-config file (`haus.workspace.yaml`, `repos.manifest.json`, or
 * `repos.local.json`) exists but cannot be parsed or does not have the expected shape.
 * Never swallowed into an empty member list — callers must handle or propagate it.
 */
export class MemberConfigError extends Error {
  readonly name = 'MemberConfigError'

  constructor(
    readonly filePath: string,
    reason: string,
  ) {
    super(`Cannot read workspace member config at ${filePath}: ${reason}`)
  }
}

type RepoManifestEntry = { id: string; folder: string; repo?: string }

/** Absolute path for `folder`: a `pathOverrides` entry wins, else `workspaceRoot/folder`.
 * An override is normalized through `path.resolve()` — against `workspaceRoot` if it's
 * relative — rather than returned verbatim: `Member.absPath` promises an absolute path,
 * and a relative `repos.local.json` override (an easy mistake to make by hand) would
 * otherwise silently produce a relative one, breaking any downstream `git -C`/worktree
 * call that isn't run from the exact directory the relative path was written against. */
function resolveAbsPath(
  workspaceRoot: string,
  folder: string,
  overrides: Record<string, string>,
): string {
  const override = overrides[folder]
  if (override) return path.resolve(workspaceRoot, override)
  return path.resolve(workspaceRoot, folder)
}

/**
 * Tolerant, minimal read of `repos.local.json`'s `pathOverrides` map only — this task has
 * no need for the rest of that file's (undocumented, skill-owned) shape, so no full schema
 * is built for it. Invalid JSON is a broken config file and throws; anything else that
 * doesn't match the expected `{ pathOverrides: { [folder]: absPath } }` shape is treated
 * as "no overrides" rather than an error, since `repos.local.json` is optional and
 * currently has no other code-enforced contract.
 */
async function readPathOverrides(workspaceRoot: string): Promise<Record<string, string>> {
  const filePath = path.join(workspaceRoot, REPOS_LOCAL_FILE)
  const result = await readJsonDetailed<unknown>(filePath)
  if (result.status === 'missing') return {}
  if (result.status === 'invalid') throw new MemberConfigError(filePath, 'invalid JSON')

  const parsed = result.value
  const rawOverrides =
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { pathOverrides?: unknown }).pathOverrides
      : undefined
  if (rawOverrides === null || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) {
    return {}
  }

  const overrides: Record<string, string> = {}
  for (const [folder, value] of Object.entries(rawOverrides as Record<string, unknown>)) {
    if (typeof value === 'string') overrides[folder] = value
  }
  return overrides
}

/** Reads `haus.workspace.yaml`; `undefined` when absent, throws when present-but-malformed. */
async function readFromWorkspaceYaml(
  workspaceRoot: string,
  overrides: Record<string, string>,
): Promise<Member[] | undefined> {
  const filePath = path.join(workspaceRoot, WORKSPACE_FILE)
  const text = await readText(filePath)
  if (text === undefined) return undefined

  const config = parseWorkspaceConfig(text)
  if (!config) throw new MemberConfigError(filePath, 'malformed YAML or invalid shape')

  return config.repos.map((repo) => ({
    id: repo.name,
    folder: repo.path,
    absPath: resolveAbsPath(workspaceRoot, repo.path, overrides),
    source: 'haus.workspace.yaml' as const,
  }))
}

/** Reads `repos.manifest.json`; `undefined` when absent, throws when present-but-malformed. */
async function readFromManifest(
  workspaceRoot: string,
  overrides: Record<string, string>,
): Promise<Member[] | undefined> {
  const filePath = path.join(workspaceRoot, REPOS_MANIFEST_FILE)
  const result = await readJsonDetailed<{ repos?: unknown }>(filePath)
  if (result.status === 'missing') return undefined
  if (result.status === 'invalid') throw new MemberConfigError(filePath, 'invalid JSON')

  const parsed = result.value
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MemberConfigError(filePath, 'expected a top-level object with a "repos" array')
  }
  const raw = parsed.repos
  if (!Array.isArray(raw)) {
    throw new MemberConfigError(filePath, '"repos" must be an array')
  }

  const members: Member[] = []
  raw.forEach((entry, index) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as RepoManifestEntry).id !== 'string' ||
      typeof (entry as RepoManifestEntry).folder !== 'string'
    ) {
      throw new MemberConfigError(
        filePath,
        `repos[${index}] must be an object with string "id" and "folder" fields`,
      )
    }
    const e = entry as RepoManifestEntry
    members.push({
      id: e.id,
      folder: e.folder,
      url: typeof e.repo === 'string' ? e.repo : undefined,
      absPath: resolveAbsPath(workspaceRoot, e.folder, overrides),
      source: 'repos.manifest.json' as const,
    })
  })
  return members
}

/**
 * Read the workspace's member repos, bridging `haus.workspace.yaml` and
 * `repos.manifest.json` into one normalized list (see module doc for the
 * precedence rule and the tolerant-read/strict-error contract).
 *
 * @param rootInfo - from {@link import('../utils/git-root.js').resolveRoots}; members
 *   resolve against `rootInfo.mainRoot` (the main checkout, not a linked worktree).
 * @throws {MemberConfigError} when a present config file cannot be parsed or does
 *   not have the expected shape — never silently returns an empty list in that case.
 * @returns an empty array only when neither `haus.workspace.yaml` nor
 *   `repos.manifest.json` exists (a workspace genuinely has no configured members yet).
 */
export async function readMembers(rootInfo: RootInfo): Promise<Member[]> {
  const workspaceRoot = rootInfo.mainRoot
  const overrides = await readPathOverrides(workspaceRoot)

  const fromYaml = await readFromWorkspaceYaml(workspaceRoot, overrides)
  if (fromYaml) return fromYaml

  const fromManifest = await readFromManifest(workspaceRoot, overrides)
  if (fromManifest) return fromManifest

  return []
}
