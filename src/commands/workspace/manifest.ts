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

export type WorkspaceManifest = {
  version: 1
  generatedAt: string
  hausVersion: string
  client: string
  repos: WorkspaceManifestRepo[]
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
