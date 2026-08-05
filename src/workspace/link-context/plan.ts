/**
 * Pure planning step for `haus workspace link-context`: given the workspace's member
 * repos, decides what SHOULD exist (one planned entry per skill/agent/command, plus
 * a source hash) without touching the filesystem beyond reading — no copying, no
 * manifest/gitignore writes. `link.ts` is the only caller that acts on the result.
 *
 * Kept filesystem-read-only and side-effect-free (aside from `hashInstalledPaths`,
 * itself read-only) so it's cheap to exercise directly in tests without a full
 * workspace fixture.
 */
import path from 'node:path'

import fs from 'fs-extra'

import type { LinkedContextAssetType } from '../../commands/workspace/manifest.js'
import { hashInstalledPaths } from '../../update/hash-installed.js'
import type { Member } from '../members.js'

import { collectSourceAssets, hasLinkableContext, type SourceAsset } from './scan-source.js'

/** One asset this run intends to (re-)copy. */
export type PlannedEntry = {
  repo: string
  type: LinkedContextAssetType
  name: string
  /** `<repoFolderPrefix>--<name>` — unique within `type` once collisions are ruled out. */
  destKey: string
  sourceRelPath: string
  /** Absolute path to the source file/directory, for the copy step. */
  sourceAbsPath: string
  sourceHash: string
}

export type SkippedMember = { repo: string; reason: string }

/** Two or more member repos would produce the same `type`/`destKey` — link-context
 * refuses to guess which one should win (see `link.ts`: this aborts the whole run). */
export type Collision = { type: LinkedContextAssetType; destKey: string; repos: string[] }

export type LinkPlan = {
  entries: PlannedEntry[]
  skipped: SkippedMember[]
  collisions: Collision[]
}

/**
 * Prefix derived from a member's folder name — never a full path, just the last
 * segment, so `<prefix>--<name>` reads as `<repo>--<skill>`. Falls back to the
 * member's actual directory name (then its id) for the edge case where `folder`
 * resolves to `.` (the workspace root is itself a configured member repo).
 */
export function repoFolderPrefix(member: Member): string {
  const base = path.basename(member.folder)
  if (base && base !== '.' && base !== path.sep) return base
  const fromAbs = path.basename(member.absPath)
  return fromAbs || member.id
}

function assetKey(type: LinkedContextAssetType, destKey: string): string {
  return `${type}:${destKey}`
}

function splitAssetKey(key: string): { type: LinkedContextAssetType; destKey: string } {
  const idx = key.indexOf(':')
  return { type: key.slice(0, idx) as LinkedContextAssetType, destKey: key.slice(idx + 1) }
}

/**
 * Build the plan for `members`: which repos are skipped (not cloned, or nothing to
 * link), which destination keys collide across repos, and — for everything else —
 * the fully-resolved entries ready to copy, each carrying a freshly computed source
 * hash for staleness comparison later (`workspace/doctor.ts`).
 */
export async function buildLinkPlan(members: Member[]): Promise<LinkPlan> {
  const skipped: SkippedMember[] = []
  const byKey = new Map<string, Array<{ repo: string; asset: SourceAsset }>>()
  const membersById = new Map(members.map((m) => [m.id, m]))

  for (const member of members) {
    // Edge case: member configured but not cloned locally yet — skip, log clearly,
    // no error (this run simply has nothing to offer for it yet).
    if (!(await fs.pathExists(member.absPath))) {
      skipped.push({ repo: member.id, reason: `not cloned locally (${member.absPath}) — skipped` })
      continue
    }
    if (!(await hasLinkableContext(member))) {
      skipped.push({
        repo: member.id,
        reason: 'no .claude/skills, .claude/agents, or .claude/commands — nothing to link',
      })
      continue
    }

    const assets = await collectSourceAssets(member)
    const prefix = repoFolderPrefix(member)
    for (const asset of assets) {
      const destKey = `${prefix}--${asset.name}`
      const key = assetKey(asset.type, destKey)
      const list = byKey.get(key) ?? []
      list.push({ repo: member.id, asset })
      byKey.set(key, list)
    }
  }

  const collisions: Collision[] = []
  const entries: PlannedEntry[] = []

  for (const [key, list] of byKey) {
    const { type, destKey } = splitAssetKey(key)
    const distinctRepos = [...new Set(list.map((l) => l.repo))]

    // Edge case: name collision surviving the repo-folder prefix — fail loudly,
    // never silently pick a winner. Collected across the whole plan so the caller
    // can report every conflict at once instead of stopping at the first.
    if (distinctRepos.length > 1) {
      collisions.push({ type, destKey, repos: distinctRepos })
      continue
    }

    const { repo, asset } = list[0]
    const member = membersById.get(repo)
    /* istanbul ignore next -- repo came from members themselves, always resolvable */
    if (!member) continue
    const sourceHash = await hashInstalledPaths(member.absPath, [asset.sourceRelPath])
    entries.push({
      repo,
      type,
      name: asset.name,
      destKey,
      sourceRelPath: asset.sourceRelPath,
      sourceAbsPath: path.join(member.absPath, asset.sourceRelPath),
      sourceHash,
    })
  }

  return { entries, skipped, collisions }
}
