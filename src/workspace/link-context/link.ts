/**
 * `haus workspace link-context` — orchestration. See
 * docs/plans/workspace-detection-and-permissions-fixes.md — Task 3.4b-e (D6, revised)
 * and docs/decisions/0028-workspace-cross-repo-context-copy-vs-symlink.md.
 *
 * Copies (never symlinks) each already-haus-initialized member repo's
 * `.claude/{skills,agents,commands}` entries into the workspace root's own
 * `.claude/{skills,agents,commands}/<repo-folder>--<name>`, so a Claude Code session
 * started at the workspace root sees every member's context immediately, under a
 * clean, collision-free name — no reliance on nested-directory skill discovery
 * behavior in any other tool.
 *
 * Every run recomputes the full plan from the CURRENT member set and copies/removes
 * to match it exactly (not an incremental diff) — re-running after a member repo is
 * added, removed, or edited always converges to the right on-disk state, including
 * removing copies for a member that dropped out of `haus.workspace.yaml`/
 * `repos.manifest.json` or is no longer cloned locally.
 */
import path from 'node:path'

import fs from 'fs-extra'

import { writeLinkContextGitignore } from '../../claude/write-gitignore.js'
import {
  readManifest,
  writeLinkedContext,
  type LinkedContextEntry,
} from '../../commands/workspace/manifest.js'
import { resolveRoots } from '../../utils/git-root.js'
import { log } from '../../utils/logger.js'
import { readMembers } from '../members.js'

import { buildLinkPlan, type Collision, type SkippedMember } from './plan.js'

export type LinkContextOptions = {
  /** Persist copies/manifest/gitignore. Default false (preview-only, matches
   * `discover`/`setup`'s `--write` convention). */
  write?: boolean
  /** Suppress this module's own log() calls (the caller owns a single JSON doc). */
  json?: boolean
}

export type LinkContextSuccess = {
  ok: true
  workspaceRoot: string
  dryRun: boolean
  /** Full set of entries valid after this run (what the manifest now records, or
   * would record under `--write`). */
  linked: LinkedContextEntry[]
  /** Destination paths newly copied this run (were not already linked). */
  added: string[]
  /** Destination paths removed this run (orphaned — member gone/uncloned/asset removed). */
  removed: string[]
  skipped: SkippedMember[]
}

export type LinkContextFailure = {
  ok: false
  error: string
  collisions: Collision[]
}

export type LinkContextResult = LinkContextSuccess | LinkContextFailure

/** Destination path (workspace-root-relative, posix separators) for a planned entry. */
function destRelPathFor(type: 'skill' | 'agent' | 'command', destKey: string): string {
  const subdir = `${type}s`
  const leaf = type === 'skill' ? destKey : `${destKey}.md`
  return path.posix.join('.claude', subdir, leaf)
}

export async function runLinkContext(
  workspaceRoot: string,
  opts: LinkContextOptions = {},
): Promise<LinkContextResult> {
  const write = opts.write ?? false
  const say = opts.json ? () => {} : log

  const rootInfo = await resolveRoots(workspaceRoot)
  const members = await readMembers(rootInfo)

  const plan = await buildLinkPlan(members)

  if (plan.collisions.length > 0) {
    const detail = plan.collisions
      .map((c) => `${c.type} "${c.destKey}" claimed by: ${c.repos.join(', ')}`)
      .join('; ')
    return {
      ok: false,
      error:
        'Name collision(s) after the repo-folder prefix — refusing to overwrite either copy. ' +
        `Rename one of the conflicting repos' folders (in haus.workspace.yaml/repos.manifest.json) ` +
        `or the conflicting skill/agent/command itself to resolve: ${detail}`,
      collisions: plan.collisions,
    }
  }

  for (const s of plan.skipped) say(`  skip ${s.repo}: ${s.reason}`)

  const priorManifest = await readManifest(workspaceRoot)
  const prior = priorManifest?.linkedContext ?? []
  const priorPaths = new Set(prior.map((e) => e.path))

  const nextEntries: LinkedContextEntry[] = []
  const added: string[] = []
  const linkedAt = new Date().toISOString()

  for (const entry of plan.entries) {
    const destRel = destRelPathFor(entry.type, entry.destKey)
    const destAbs = path.join(workspaceRoot, destRel)

    if (write) {
      await fs.ensureDir(path.dirname(destAbs))
      if (await fs.pathExists(destAbs)) await fs.remove(destAbs)
      // fs.copy defaults to dereference:false (never follows a symlink inside the
      // source content) — same posture ADR-0019/ADR-0021 already established for
      // catalog items; see ADR-0028 for why this feature copies rather than symlinks
      // at all.
      await fs.copy(entry.sourceAbsPath, destAbs, { overwrite: true, errorOnExist: false })
    }

    if (!priorPaths.has(destRel)) added.push(destRel)
    nextEntries.push({
      repo: entry.repo,
      type: entry.type,
      name: entry.name,
      path: destRel,
      sourceRelPath: entry.sourceRelPath,
      sourceHash: entry.sourceHash,
      linkedAt,
    })
  }

  // Orphan cleanup: anything previously linked that this run's plan no longer
  // produces — the member dropped out of config, is no longer cloned, or the
  // asset itself was removed/renamed at the source.
  const nextPaths = new Set(nextEntries.map((e) => e.path))
  const removed: string[] = []
  for (const old of prior) {
    if (nextPaths.has(old.path)) continue
    removed.push(old.path)
    if (write) {
      const abs = path.join(workspaceRoot, old.path)
      if (await fs.pathExists(abs)) await fs.remove(abs)
    }
  }

  if (write) {
    await writeLinkedContext(workspaceRoot, nextEntries)
    await writeLinkContextGitignore(workspaceRoot, false)
  }

  return {
    ok: true,
    workspaceRoot,
    dryRun: !write,
    linked: nextEntries,
    added,
    removed,
    skipped: plan.skipped,
  }
}
