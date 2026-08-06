/**
 * Workspace manifest — a workspace-root aggregate record of per-repo setup state.
 *
 * Location: `<workspaceRoot>/.haus-workflow/workspace.manifest.json` (a sibling of
 * the per-repo `haus.lock.json`, never a replacement for them). The manifest is
 * **derived and advisory only**: per-repo `checkLock` ({@link ../../update/lockfile})
 * stays the source of truth, so a stale manifest can never corrupt repo state.
 *
 * Written at the end of `workspace setup`; `discover` may seed `pending` entries.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { readJson, writeJson } from '../../utils/fs.js'
import { hausPath, packageRoot } from '../../utils/paths.js'

export type ManifestRepoStatus = 'ok' | 'failed' | 'pending'

export type WorkspaceManifestRepo = {
  name: string
  path: string
  role: string
  lastSetupAt: string | null
  hausVersionAtSetup: string | null
  lockItemCount: number
  catalogRef: string | null
  status: ManifestRepoStatus
  error?: string
}

/** Which kind of catalog-shaped asset a {@link LinkedContextEntry} copies. */
export type LinkedContextAssetType = 'skill' | 'agent' | 'command'

/**
 * One copied cross-repo skill/agent/command, written by `haus workspace link-context`
 * (see `src/workspace/link-context/`). Tracked here so `doctor`/`apply --write` know
 * these `.claude/{skills,agents,commands}` entries are generated and don't misreport
 * them as drift — see docs/decisions/0028-workspace-cross-repo-context-copy-vs-symlink.md.
 */
export type LinkedContextEntry = {
  /** Member id (matches `Member.id` from `../../workspace/members.js`). */
  repo: string
  type: LinkedContextAssetType
  /** Source asset name, unprefixed (e.g. the skill directory name). */
  name: string
  /** Workspace-root-relative destination path of the copy (posix separators). */
  path: string
  /** Member-repo-relative path of the source (posix separators). */
  sourceRelPath: string
  /** Content hash of the source at link time, via `hashInstalledPaths` (Re-hash the
   * live source and compare to detect staleness — see `workspace/doctor.ts`). */
  sourceHash: string
  linkedAt: string
}

export type WorkspaceManifest = {
  version: 1
  generatedAt: string
  hausVersion: string
  client: string
  repos: WorkspaceManifestRepo[]
  /** Present only once `haus workspace link-context` has run at least once. */
  linkedContext?: LinkedContextEntry[]
}

const MANIFEST_FILE = 'workspace.manifest.json'

/** Absolute path of the workspace manifest for a given workspace root. */
export function manifestPath(workspaceRoot: string): string {
  return hausPath(workspaceRoot, MANIFEST_FILE)
}

/** Read the installed haus version from the package root, or `0.0.0` if unavailable. */
export function hausVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')) as {
      version?: string
    }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/**
 * Per-repo input to {@link buildManifest}. Caller decides each repo's final status.
 *
 * `lastSetupAt`/`hausVersionAtSetup` are optional overrides: when omitted, `ok` repos
 * are stamped with the build's `now`/`version` and others get null. Supply them to
 * carry a prior entry forward verbatim (e.g. a repo skipped by `--only`).
 */
export type ManifestRepoInput = {
  name: string
  path: string
  role: string
  status: ManifestRepoStatus
  lockItemCount: number
  catalogRef: string | null
  error?: string
  lastSetupAt?: string | null
  hausVersionAtSetup?: string | null
}

/**
 * Build a {@link WorkspaceManifest} from per-repo inputs.
 *
 * By default `ok` repos are stamped with the setup timestamp + current version while
 * `failed`/`pending` repos carry no setup stamp (null) — so drift detection can tell
 * "set up at version X" from "never set up". Per-repo overrides win when provided.
 */
export function buildManifest(opts: {
  client: string
  repos: ManifestRepoInput[]
  now?: string
  version?: string
  /** Carry a prior `linkedContext` section forward verbatim — `buildManifest` has no
   * opinion on cross-repo link state, it just must not silently drop it on a rebuild
   * (`link-context` owns writing this section; see `writeLinkedContext` below). */
  linkedContext?: LinkedContextEntry[]
}): WorkspaceManifest {
  const now = opts.now ?? new Date().toISOString()
  const version = opts.version ?? hausVersion()
  return {
    version: 1,
    generatedAt: now,
    hausVersion: version,
    client: opts.client,
    repos: opts.repos.map((repo) => ({
      name: repo.name,
      path: repo.path,
      role: repo.role,
      lastSetupAt:
        repo.lastSetupAt !== undefined ? repo.lastSetupAt : repo.status === 'ok' ? now : null,
      hausVersionAtSetup:
        repo.hausVersionAtSetup !== undefined
          ? repo.hausVersionAtSetup
          : repo.status === 'ok'
            ? version
            : null,
      lockItemCount: repo.lockItemCount,
      catalogRef: repo.catalogRef,
      status: repo.status,
      ...(repo.error ? { error: repo.error } : {}),
    })),
    ...(opts.linkedContext ? { linkedContext: opts.linkedContext } : {}),
  }
}

/** Read the workspace manifest, or `undefined` when absent/malformed. */
export async function readManifest(workspaceRoot: string): Promise<WorkspaceManifest | undefined> {
  return readJson<WorkspaceManifest>(manifestPath(workspaceRoot))
}

/** Write the workspace manifest. Returns the absolute path written. */
export async function writeWorkspaceManifest(
  workspaceRoot: string,
  manifest: WorkspaceManifest,
): Promise<string> {
  const target = manifestPath(workspaceRoot)
  await writeJson(target, manifest)
  return target
}

/** Read just the `linkedContext` section — `[]` when the manifest or the section is absent. */
export async function readLinkedContext(workspaceRoot: string): Promise<LinkedContextEntry[]> {
  const manifest = await readManifest(workspaceRoot)
  return manifest?.linkedContext ?? []
}

/**
 * Write (replace) the `linkedContext` section, preserving everything else in the
 * manifest verbatim. When no manifest exists yet (`link-context` run standalone
 * before `workspace setup`), a minimal skeleton is created with an empty `repos`
 * list — `doctor`'s existing `no-manifest`/per-repo checks still apply correctly
 * against it once `setup` actually runs.
 */
export async function writeLinkedContext(
  workspaceRoot: string,
  linkedContext: LinkedContextEntry[],
): Promise<string> {
  const prior = await readManifest(workspaceRoot)
  const next: WorkspaceManifest = prior
    ? { ...prior, generatedAt: new Date().toISOString(), linkedContext }
    : {
        version: 1,
        generatedAt: new Date().toISOString(),
        hausVersion: hausVersion(),
        client: 'unknown',
        repos: [],
        linkedContext,
      }
  return writeWorkspaceManifest(workspaceRoot, next)
}
