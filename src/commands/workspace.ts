/**
 * `haus workspace` — multi-repo workspace dispatcher.
 *
 * Thin command layer: resolves the workspace root (the dir holding
 * `haus.workspace.yaml`) and delegates to the focused modules under
 * `src/commands/workspace/`:
 *
 * - `init`     — scaffold a minimal `haus.workspace.yaml`.
 * - `discover` — auto-find member repos and write/merge the yaml.
 * - `scan`     — aggregate cross-repo summary (no per-repo setup).
 * - `setup`    — per-repo setup loop + workspace layer + manifest.
 * - `doctor`   — workspace drift report.
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { scanProject } from '../scanner/scan-project.js'
import { readText, writeText } from '../utils/fs.js'
import { error, log } from '../utils/logger.js'

import { writeWorkspaceArtifacts, type WorkspaceRepoInput } from './workspace/aggregate.js'
import { parseWorkspaceConfig, WORKSPACE_FILE } from './workspace/config.js'
import { runDiscover } from './workspace/discover.js'
import { runWorkspaceDoctor } from './workspace/doctor.js'
import { resolveWorkspaceRoot, runWorkspaceSetup } from './workspace/setup.js'

export type WorkspaceAction = 'init' | 'discover' | 'scan' | 'setup' | 'doctor'

/** Raw flags from commander (camelCased); normalized per-action before delegating. */
export type WorkspaceOptions = {
  write?: boolean
  dryRun?: boolean
  json?: boolean
  continueOnError?: boolean
  only?: string | string[]
  maxDepth?: string | number
  client?: string
}

/** Normalize a comma-or-space separated `--only` value into a name list. */
function normalizeOnly(only: WorkspaceOptions['only']): string[] | undefined {
  if (!only) return undefined
  const list = Array.isArray(only) ? only : only.split(/[\s,]+/)
  const cleaned = list.map((s) => s.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned : undefined
}

function normalizeMaxDepth(maxDepth: WorkspaceOptions['maxDepth']): number | undefined {
  if (maxDepth === undefined) return undefined
  const n = typeof maxDepth === 'number' ? maxDepth : Number.parseInt(maxDepth, 10)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

/** Scaffold a minimal workspace yaml in the current directory. */
async function initWorkspace(): Promise<void> {
  await writeText(
    WORKSPACE_FILE,
    `client: unknown\nrepos:\n  - name: current\n    path: .\n    role: auto\nrelationships: []\n`,
  )
  log('Workspace initialized.')
}

/**
 * Aggregate cross-repo summary from a `fast` scan of each member repo (no per-repo
 * setup). Shares `writeWorkspaceArtifacts` with the setup loop so artifacts match.
 */
async function scanWorkspace(workspaceRoot: string, opts: { json?: boolean }): Promise<void> {
  const configText = await readText(path.join(workspaceRoot, WORKSPACE_FILE))
  if (!configText) {
    error(`Missing ${WORKSPACE_FILE}. Run \`haus workspace discover\` or \`init\` first.`)
    process.exitCode = 1
    return
  }
  const config = parseWorkspaceConfig(configText)
  if (!config) {
    error(
      `Malformed ${WORKSPACE_FILE}. Fix the YAML or re-run \`haus workspace discover --write\`.`,
    )
    process.exitCode = 1
    return
  }
  if (config.repos.length === 0) {
    error(`No repos configured in ${WORKSPACE_FILE}.`)
    process.exitCode = 1
    return
  }

  const inputs: WorkspaceRepoInput[] = []
  for (const repo of config.repos) {
    const repoRoot = path.resolve(workspaceRoot, repo.path)
    // Guard a misconfigured path before fast-glob (a non-directory cwd throws ENOTDIR
    // on Linux) so a bad entry surfaces a clean message, not a stack trace.
    if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
      throw new Error(`Repo path is not a directory: ${repo.path}`)
    }
    const result = await scanProject(repoRoot)
    inputs.push({ name: repo.name, path: repo.path, context: result })
  }
  const written = await writeWorkspaceArtifacts(workspaceRoot, inputs, config.relationships)
  if (opts.json) {
    log(JSON.stringify({ written }, null, 2))
  } else {
    log(`Workspace scan complete. Wrote ${written.length} artifact(s) under .haus-workflow/.`)
  }
}

/**
 * Dispatch a workspace subcommand.
 *
 * @param action - The workspace subcommand to run.
 * @param options - Raw commander flags (normalized per action).
 */
export async function runWorkspace(
  action: WorkspaceAction,
  options: WorkspaceOptions = {},
): Promise<void> {
  if (action === 'init') {
    await initWorkspace()
    return
  }

  const workspaceRoot = resolveWorkspaceRoot()

  switch (action) {
    case 'discover':
      await runDiscover(workspaceRoot, {
        write: options.write,
        json: options.json,
        maxDepth: normalizeMaxDepth(options.maxDepth),
        client: options.client,
      })
      return
    case 'scan':
      await scanWorkspace(workspaceRoot, { json: options.json })
      return
    case 'setup':
      await runWorkspaceSetup(workspaceRoot, {
        write: options.write,
        dryRun: options.dryRun,
        json: options.json,
        continueOnError: options.continueOnError,
        only: normalizeOnly(options.only),
      })
      return
    case 'doctor':
      await runWorkspaceDoctor(workspaceRoot, { json: options.json })
      return
  }
}
