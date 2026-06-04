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

import YAML from 'yaml'

import { checkLock } from '../../update/lockfile.js'
import { readText } from '../../utils/fs.js'
import { log, warn } from '../../utils/logger.js'
import { claudePath, hausPath } from '../../utils/paths.js'

import { hausVersion, readManifest, type WorkspaceManifest } from './manifest.js'

const WORKSPACE_FILE = 'haus.workspace.yaml'

export type DriftKind =
  | 'no-manifest'
  | 'missing-from-manifest'
  | 'version-mismatch'
  | 'missing-claude'
  | 'missing-lock'
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

type YamlRepo = { name: string; path: string; role?: string }

function parseYamlRepos(text: string | undefined): YamlRepo[] {
  if (!text) return []
  let parsed: unknown
  try {
    parsed = YAML.parse(text)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const repos = (parsed as { repos?: unknown }).repos
  if (!Array.isArray(repos)) return []
  return repos.filter(
    (r): r is YamlRepo =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as YamlRepo).name === 'string' &&
      typeof (r as YamlRepo).path === 'string',
  )
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
  const manifest = await readManifest(workspaceRoot)
  const yamlRepos = parseYamlRepos(await readText(path.join(workspaceRoot, WORKSPACE_FILE)))
  const currentVersion = hausVersion()
  const drift: WorkspaceDriftItem[] = []

  // Buffered ok()/flag() so the verdict can print before the detail (matches `haus doctor`).
  const detail: Array<{ stream: 'log' | 'warn'; text: string }> = []
  const ok = (text: string) => detail.push({ stream: 'log', text })
  const flag = (item: WorkspaceDriftItem) => {
    drift.push(item)
    detail.push({ stream: 'warn', text: `- ${item.repo}: ${item.detail}` })
  }

  if (!manifest) {
    flag({
      repo: '(workspace)',
      kind: 'no-manifest',
      detail: 'No workspace.manifest.json — run `haus workspace setup --write` first.',
    })
  }

  const manifestByName = new Map((manifest?.repos ?? []).map((r) => [r.name, r]))

  for (const repo of yamlRepos) {
    const repoRoot = path.resolve(workspaceRoot, repo.path)
    const entry = manifestByName.get(repo.name)

    if (manifest && !entry) {
      flag({
        repo: repo.name,
        kind: 'missing-from-manifest',
        detail:
          'Configured in yaml but absent from the manifest — run `haus workspace setup --write`.',
      })
      continue
    }

    if (entry?.status === 'failed') {
      flag({
        repo: repo.name,
        kind: 'failed',
        detail: `Last setup failed${entry.error ? `: ${entry.error}` : ''}.`,
      })
    }

    if (entry?.hausVersionAtSetup && entry.hausVersionAtSetup !== currentVersion) {
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
    } else if (!lock.ok) {
      ok(`- ${repo.name}: lock present but empty/invalid`)
    } else {
      ok(`- ${repo.name}: OK (${lock.count} lock item(s))`)
    }
  }

  if (opts.json) {
    log(JSON.stringify({ manifest: manifest ?? null, drift }, null, 2))
  } else {
    if (drift.length === 0) {
      log('✅ Workspace is set up and healthy.')
    } else {
      log(`⚠️ ${drift.length} workspace drift item(s) need attention:`)
      for (const d of drift) log(`  • ${d.repo}: ${d.detail}`)
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
