/**
 * Enumerates a member repo's linkable `.claude/{skills,agents,commands}` content.
 *
 * Skills are directories (one per skill, identified by a `SKILL.md` inside — the same
 * signal `src/install/apply.ts`'s `collectSourceFiles` already uses for the global
 * install path). Agents and commands are flat `*.md` files directly under their
 * respective directory (matching `collectSourceFiles`'s "global slash commands" case —
 * this codebase has no nested-command convention to preserve).
 *
 * Read-only: never copies, never hashes. See `plan.ts` for what happens with the
 * result.
 */
import path from 'node:path'

import fs from 'fs-extra'

import type { LinkedContextAssetType } from '../../commands/workspace/manifest.js'
import type { Member } from '../members.js'

/** One linkable asset found under a member repo's `.claude/`. */
export type SourceAsset = {
  type: LinkedContextAssetType
  /** Asset name, unprefixed (e.g. the skill directory name, or the `.md` file's stem). */
  name: string
  /** Member-repo-relative path to the source file or directory (posix separators). */
  sourceRelPath: string
}

const ASSET_SUBDIR: Record<LinkedContextAssetType, string> = {
  skill: 'skills',
  agent: 'agents',
  command: 'commands',
}

/** True when `member`'s repo has at least one of `.claude/{skills,agents,commands}` —
 * the "already haus-initialized" gate `link-context` uses to decide whether a member
 * has anything to offer at all, independent of whether any individual asset qualifies. */
export async function hasLinkableContext(member: Member): Promise<boolean> {
  for (const subdir of Object.values(ASSET_SUBDIR)) {
    if (await fs.pathExists(path.join(member.absPath, '.claude', subdir))) return true
  }
  return false
}

/** Enumerate skill directories (each containing `SKILL.md`) under `.claude/skills`. */
async function collectSkills(member: Member): Promise<SourceAsset[]> {
  const dir = path.join(member.absPath, '.claude', 'skills')
  if (!(await fs.pathExists(dir))) return []
  const names = await fs.readdir(dir)
  const out: SourceAsset[] = []
  for (const name of [...names].sort()) {
    const abs = path.join(dir, name)
    const stat = await fs.stat(abs)
    if (!stat.isDirectory()) continue
    if (!(await fs.pathExists(path.join(abs, 'SKILL.md')))) continue
    out.push({ type: 'skill', name, sourceRelPath: path.posix.join('.claude', 'skills', name) })
  }
  return out
}

/** Enumerate flat `*.md` files under `.claude/agents` or `.claude/commands`. */
async function collectFlatMarkdown(
  member: Member,
  type: 'agent' | 'command',
): Promise<SourceAsset[]> {
  const subdir = ASSET_SUBDIR[type]
  const dir = path.join(member.absPath, '.claude', subdir)
  if (!(await fs.pathExists(dir))) return []
  const names = await fs.readdir(dir)
  const out: SourceAsset[] = []
  for (const fileName of [...names].sort()) {
    if (!fileName.endsWith('.md')) continue
    const abs = path.join(dir, fileName)
    if (!(await fs.stat(abs)).isFile()) continue
    const name = fileName.slice(0, -'.md'.length)
    out.push({ type, name, sourceRelPath: path.posix.join('.claude', subdir, fileName) })
  }
  return out
}

/** Enumerate every linkable skill/agent/command under `member`'s `.claude/`. */
export async function collectSourceAssets(member: Member): Promise<SourceAsset[]> {
  const [skills, agents, commands] = await Promise.all([
    collectSkills(member),
    collectFlatMarkdown(member, 'agent'),
    collectFlatMarkdown(member, 'command'),
  ])
  return [...skills, ...agents, ...commands]
}
