/**
 * `haus workspace doctor` — workspace-level drift report.
 *
 * Reads the workspace manifest + `haus.workspace.yaml`, then for every configured
 * repo runs `checkLock` and inspects on-disk state. Flags drift when a repo is in
 * the yaml but absent from the manifest, when its recorded `hausVersionAtSetup`
 * differs from the current CLI version, when its `.claude/`/`haus.lock.json` is
 * missing, or when the manifest recorded a failed setup.
 *
 * The manifest is advisory; per-repo `checkLock` remains the source of truth, so a
 * stale manifest cannot corrupt repo state — doctor only *reports*.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { checkLock } from '../../update/lockfile.js'
import { log, warn } from '../../utils/logger.js'
import { claudePath, hausPath } from '../../utils/paths.js'

import { readWorkspaceConfig } from './config.js'
import { hausVersion, readManifest, type WorkspaceManifest } from './manifest.js'

export type DriftKind =
  | 'no-config'
  | 'no-manifest'
  | 'missing-from-manifest'
  | 'version-mismatch'
  | 'missing-claude'
  | 'missing-lock'
  | 'invalid-lock'
  | 'failed'

export type WorkspaceDriftItem = {
  repo: string
  kind: DriftKind
  detail: string
}

export type WorkspaceDoctorResult = {
  workspaceRoot: string
  manifest: WorkspaceManifest | undefined
  drift: WorkspaceDriftItem[]
}

/**
 * Run the workspace drift report.
 *
 * @param workspaceRoot - Absolute path to the directory holding `haus.workspace.yaml`.
 * @param opts.json - Emit `{ manifest, drift }` as JSON instead of the human report.
 */
export async function runWorkspaceDoctor(
  workspaceRoot: string,
  opts: { json?: boolean } = {},
): Promise<WorkspaceDoctorResult> {
  const config = await readWorkspaceConfig(workspaceRoot)
  const manifest = await readManifest(workspaceRoot)
  const currentVersion = hausVersion()
  const drift: WorkspaceDriftItem[] = []

  // Buffered ok()/flag() so the verdict can print before the detail (matches `haus doctor`).
  const detail: Array<{ stream: 'log' | 'warn'; text: string }> = []
  const ok = (text: string) => detail.push({ stream: 'log', text })
  const flag = (item: WorkspaceDriftItem) => {
    drift.push(item)
    detail.push({ stream: 'warn', text: `- ${item.repo}: ${item.detail}` })
  }

  // No (or malformed) workspace yaml → there is nothing to validate. Fail loudly
  // rather than reporting a repo-less workspace as "healthy".
  if (!config) {
    flag({
      repo: '(workspace)',
      kind: 'no-config',
      detail:
        'Missing or malformed haus.workspace.yaml — run `haus workspace discover --write` or `init`.',
    })
    return emit({ workspaceRoot, manifest, drift, detail, json: opts.json })
  }

  // No manifest → a single workspace-level flag; skip the per-repo checks, which
  // would otherwise pile a missing-claude/missing-lock item onto every repo and
  // bury the one actionable message ("run setup").
  if (!manifest) {
    flag({
      repo: '(workspace)',
      kind: 'no-manifest',
      detail: 'No workspace.manifest.json — run `haus workspace setup --write` first.',
    })
    return emit({ workspaceRoot, manifest, drift, detail, json: opts.json })
  }

  const manifestByName = new Map(manifest.repos.map((r) => [r.name, r]))

  for (const repo of config.repos) {
    const repoRoot = path.resolve(workspaceRoot, repo.path)
    const entry = manifestByName.get(repo.name)

    if (!entry) {
      flag({
        repo: repo.name,
        kind: 'missing-from-manifest',
        detail:
          'Configured in yaml but absent from the manifest — run `haus workspace setup --write`.',
      })
      continue
    }

    // Track drift added for this repo so a clean repo gets exactly one "OK" line and
    // a flagged repo gets none (avoids an internally contradictory report).
    const driftBefore = drift.length

    if (entry.status === 'failed') {
      flag({
        repo: repo.name,
        kind: 'failed',
        detail: `Last setup failed${entry.error ? `: ${entry.error}` : ''}.`,
      })
    }

    if (entry.hausVersionAtSetup && entry.hausVersionAtSetup !== currentVersion) {
      flag({
        repo: repo.name,
        kind: 'version-mismatch',
        detail: `Set up at haus ${entry.hausVersionAtSetup}, current is ${currentVersion} — re-run setup.`,
      })
    }

    if (!existsSync(claudePath(repoRoot))) {
      flag({
        repo: repo.name,
        kind: 'missing-claude',
        detail: 'Missing .claude/ — run `haus workspace setup --write`.',
      })
    }

    const lock = await checkLock(repoRoot)
    if (!existsSync(hausPath(repoRoot, 'haus.lock.json'))) {
      flag({
        repo: repo.name,
        kind: 'missing-lock',
        detail: 'Missing .haus-workflow/haus.lock.json — run `haus workspace setup --write`.',
      })
    } else if (lock.count > 0 && !lock.ok) {
      // Present with items but invalid (e.g. a malformed version) — corruption, not
      // "not set up". An empty lock (count 0) is left as info: a repo may legitimately
      // have no catalog items, so flagging it would be a false positive.
      flag({
        repo: repo.name,
        kind: 'invalid-lock',
        detail: 'haus.lock.json present but invalid — re-run `haus workspace setup --write`.',
      })
    }

    if (drift.length === driftBefore) {
      ok(`- ${repo.name}: OK (${lock.count} lock item(s))`)
    }
  }

  return emit({ workspaceRoot, manifest, drift, detail, json: opts.json })
}

type DetailLine = { stream: 'log' | 'warn'; text: string }

/**
 * Render the report (json or buffered human verdict-then-detail), set a non-zero
 * exit on any drift, and return the structured result. Shared by the normal path
 * and the early no-manifest return so both behave identically.
 */
function emit(args: {
  workspaceRoot: string
  manifest: WorkspaceManifest | undefined
  drift: WorkspaceDriftItem[]
  detail: DetailLine[]
  json?: boolean
}): WorkspaceDoctorResult {
  const { workspaceRoot, manifest, drift, detail } = args
  if (args.json) {
    log(JSON.stringify({ manifest: manifest ?? null, drift }, null, 2))
  } else {
    // Verdict first (a one-line summary), then the buffered detail — the per-item
    // specifics live in the detail lines only, so they are not printed twice.
    if (drift.length === 0) {
      log('✅ Workspace is set up and healthy.')
    } else {
      log(`⚠️ ${drift.length} workspace drift item(s) need attention:`)
    }
    log('Haus Workspace Doctor')
    for (const line of detail) {
      if (line.stream === 'warn') warn(line.text)
      else log(line.text)
    }
  }

  if (drift.length > 0) process.exitCode = 1

  return { workspaceRoot, manifest, drift }
}
