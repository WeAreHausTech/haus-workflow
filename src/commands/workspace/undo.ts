/**
 * `haus workspace undo` — reverts a workspace-level setup: runs the existing
 * hash-gated `haus undo` once per configured member repo, then removes the
 * workspace-root aggregate artifacts (`haus workspace setup` writer output) and
 * the workspace manifest. `haus.workspace.yaml` itself is left untouched — it's
 * the user's own config, not haus-owned output.
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import fs from 'fs-extra'

import { BLOCK_BEGIN, stripHausBlock } from '../../claude/write-root-claude-md.js'
import { readText } from '../../utils/fs.js'
import { error, log, warn } from '../../utils/logger.js'
import { hausPath } from '../../utils/paths.js'
import { confirm } from '../../utils/prompts.js'
import { runUndo } from '../undo.js'

import { readWorkspaceConfig, WORKSPACE_FILE } from './config.js'
import { manifestPath } from './manifest.js'

/** The four workspace-root aggregate artifacts `writeWorkspaceArtifacts` writes. */
const WORKSPACE_AGGREGATE_FILES = [
  'workspace-summary.json',
  'dependency-ownership-map.json',
  'cross-repo-summary.md',
  'workspace-context-map.json',
]

export type WorkspaceUndoOptions = { yes?: boolean }

/**
 * Undo a workspace-level `haus workspace setup`.
 *
 * @param workspaceRoot - Absolute path to the directory holding `haus.workspace.yaml`.
 */
export async function runWorkspaceUndo(
  workspaceRoot: string,
  options: WorkspaceUndoOptions = {},
): Promise<void> {
  const config = await readWorkspaceConfig(workspaceRoot)
  if (!config) {
    error(`Missing or malformed ${WORKSPACE_FILE}. Nothing to undo.`)
    process.exitCode = 1
    return
  }

  if (config.repos.length === 0) {
    log(`No repos configured in ${WORKSPACE_FILE}.`)
  }

  if (!options.yes) {
    const ok = await confirm(
      `Undo haus setup for ${config.repos.length} repo(s) in this workspace, plus workspace-root artifacts?`,
    )
    if (!ok) {
      log('Cancelled.')
      return
    }
  }

  // One repo's undo failing must not abort the loop — but it also must not report
  // success. Continue through every repo, then fail the exit code if any repo failed,
  // so CI/scripts can detect a partial-failure workspace state instead of a false ok.
  let anyRepoFailed = false
  for (const repo of config.repos) {
    const repoRoot = path.resolve(workspaceRoot, repo.path)
    log(`\n→ ${repo.name} (${repo.path})`)
    try {
      // Same pre-check runWorkspaceSetup already uses: a misconfigured path (missing
      // dir, or a file) must fail cleanly here, not throw an opaque error deep inside
      // runUndo's own filesystem calls.
      if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
        throw new Error(`Repo path is not a directory: ${repo.path}`)
      }
      await runUndo({ yes: true, root: repoRoot })
    } catch (err) {
      anyRepoFailed = true
      warn(`Undo failed for ${repo.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Workspace-root aggregate artifacts — always safe to remove: machine-generated,
  // never user-authored (see aggregate.ts's own docblock: "no re-scan").
  for (const rel of WORKSPACE_AGGREGATE_FILES) {
    const abs = hausPath(workspaceRoot, rel)
    if (await fs.pathExists(abs)) {
      await fs.remove(abs)
      log(`Removed ${path.relative(workspaceRoot, abs)}`)
    }
  }

  const manifestFile = manifestPath(workspaceRoot)
  if (await fs.pathExists(manifestFile)) {
    await fs.remove(manifestFile)
    log(`Removed ${path.relative(workspaceRoot, manifestFile)}`)
  }

  // Workspace doc: when `haus workspace setup` used the collision path, WORKSPACE.md
  // is fully haus-owned (written verbatim, no user content) — remove it outright.
  // Otherwise the haus block was injected into the workspace-root CLAUDE.md alongside
  // user content, so only the block is stripped, via the same sentinels per-repo
  // `haus undo` already uses for the analogous per-repo CLAUDE.md.
  const workspaceMdPath = hausPath(workspaceRoot, 'WORKSPACE.md')
  if (await fs.pathExists(workspaceMdPath)) {
    await fs.remove(workspaceMdPath)
    log(`Removed ${path.relative(workspaceRoot, workspaceMdPath)}`)
  } else {
    const claudeMdPath = path.join(workspaceRoot, 'CLAUDE.md')
    if (existsSync(claudeMdPath)) {
      const prev = await readText(claudeMdPath)
      if (prev?.includes(BLOCK_BEGIN)) {
        const next = stripHausBlock(prev)
        if (next.length === 0) {
          await fs.remove(claudeMdPath)
          log('Removed CLAUDE.md (only contained the workspace haus import block).')
        } else {
          await fs.writeFile(claudeMdPath, next, 'utf8')
          log('Removed haus import block from CLAUDE.md (user content preserved).')
        }
      }
    }
  }

  log(`${WORKSPACE_FILE} left in place — it's your own config, not haus-owned output.`)
  if (anyRepoFailed) {
    process.exitCode = 1
    warn('Workspace undo finished with at least one repo failure — see above.')
  } else {
    log('Workspace undo complete.')
  }
}
