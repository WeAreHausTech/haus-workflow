/**
 * Workspace-root context document.
 *
 * Models {@link writeRootClaudeMd}: reuses the same tamper-safe `injectHausBlock`
 * sentinels so user content outside the managed block survives. The block imports
 * the aggregate `cross-repo-summary.md` and lists the member repos + paths.
 *
 * Collision guard: when the workspace root is also a member repo (`path: .`), the
 * per-repo setup already owns that directory's `CLAUDE.md`. To avoid clobbering it,
 * the aggregate is written to `.haus-workflow/WORKSPACE.md` instead.
 */
import path from 'node:path'

import fs from 'fs-extra'

import { createUnifiedDiff, hasTextChanged, summarizeDiff } from '../utils/diff.js'
import { writeText } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { displayPath, hausPath } from '../utils/paths.js'

import { BLOCK_BEGIN, BLOCK_END, injectHausBlock } from './write-root-claude-md.js'

/** A member repo as listed in the workspace document. */
export type WorkspaceMember = { name: string; path: string }

/** Build the managed import block for the workspace document. */
export function buildWorkspaceImportBlock(client: string, members: WorkspaceMember[]): string {
  const memberLines = members.map((m) => `- ${m.name} (${m.path})`)
  const body = [
    '@.haus-workflow/cross-repo-summary.md',
    '',
    `# Workspace: ${client}`,
    '',
    'Member repos:',
    ...memberLines,
  ].join('\n')
  return `${BLOCK_BEGIN}\n${body}\n${BLOCK_END}`
}

export type WriteWorkspaceClaudeMdOptions = {
  client: string
  members: WorkspaceMember[]
  /** True when the workspace root is also a member repo (`path: .`). */
  collision: boolean
  dryRun?: boolean
  /** Suppress stdout logging (used under --json to keep output parseable). */
  quiet?: boolean
}

/**
 * Write the workspace context document at `workspaceRoot`.
 *
 * Without a collision the managed block is injected into `workspaceRoot/CLAUDE.md`
 * (preserving surrounding user content). With a collision the aggregate is written
 * standalone to `.haus-workflow/WORKSPACE.md`.
 *
 * @returns Absolute path of the file written (or that would be written in dry-run).
 */
export async function writeWorkspaceClaudeMd(
  workspaceRoot: string,
  opts: WriteWorkspaceClaudeMdOptions,
): Promise<string> {
  const block = buildWorkspaceImportBlock(opts.client, opts.members)
  const dryRun = opts.dryRun ?? false

  const filePath = opts.collision
    ? hausPath(workspaceRoot, 'WORKSPACE.md')
    : path.join(workspaceRoot, 'CLAUDE.md')

  const say = opts.quiet ? () => {} : log

  // The standalone WORKSPACE.md is haus-owned, so it is written verbatim. The shared
  // CLAUDE.md is injected so any user content outside the sentinels is preserved.
  const prev = (await fs.pathExists(filePath)) ? await fs.readFile(filePath, 'utf8') : ''
  const next = opts.collision ? `${block}\n` : injectHausBlock(prev, block)
  const printable = displayPath(workspaceRoot, filePath)

  if (dryRun) {
    if (!prev) {
      say(createUnifiedDiff(printable, '', next))
    } else if (hasTextChanged(prev, next)) {
      say(createUnifiedDiff(printable, prev, next))
    } else {
      say(`${printable}: unchanged`)
    }
    return filePath
  }

  if (hasTextChanged(prev, next) && prev.length > 0) {
    const diffText = createUnifiedDiff(printable, prev, next)
    const summary = summarizeDiff(diffText)
    say(`Overwriting ${printable} (diff +${summary.additions} -${summary.deletions})`)
  }

  await writeText(filePath, next)
  return filePath
}
