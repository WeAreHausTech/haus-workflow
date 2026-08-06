/**
 * Per-workspace-worktree state file — `.haus-worktree.json`, written by `add` at
 * the workspace-worktree root (`<mainRoot>/.claude/worktrees/<slug>/`).
 *
 * `list`/`remove`/`doctor` all read this instead of re-deriving "what members did
 * we materialize and on what branch" from git alone — git has no first-class
 * concept of "this set of per-repo worktrees belongs together as one workspace
 * worktree", so this file is the source of truth for that grouping. It is
 * deliberately not git state (git only knows about the worktree registrations
 * themselves): losing it degrades `list`/`doctor` to best-effort (they fall back
 * to "every currently configured member" and current `HEAD`), it never blocks
 * `remove`, which can still find member worktrees via `readMembers()` + on-disk
 * presence even without it.
 */
import path from 'node:path'

import { readJson, writeJson } from '../../utils/fs.js'

export const WORKTREE_STATE_FILE = '.haus-worktree.json'

/**
 * One member repo's materialization record inside a workspace worktree.
 *
 * `absPath` is captured at `add` time specifically so `remove` can still locate
 * and unregister this member's `git worktree` even if the member later drops out
 * of `haus.workspace.yaml`/`repos.manifest.json` (renamed, removed) before
 * `remove` runs — without it, a config-dropped member's worktree directory would
 * still get deleted (nested under the workspace worktree root) while its git
 * registration in the now-unreachable owning repo silently leaks. Optional only
 * because a `.haus-worktree.json` written before this field existed won't have
 * it — `remove` treats that case as unverifiable and blocks by default rather
 * than guessing.
 */
export type WorktreeMemberState = {
  id: string
  folder: string
  branch: string
  absPath?: string
}

/** The full state recorded for one `.claude/worktrees/<slug>` workspace worktree. */
export type WorktreeState = {
  slug: string
  branch: string
  createdAt: string
  members: WorktreeMemberState[]
}

/** `<mainRoot>/.claude/worktrees` — the parent directory of every workspace worktree. */
export function worktreesDir(mainRoot: string): string {
  return path.join(mainRoot, '.claude', 'worktrees')
}

/** `<mainRoot>/.claude/worktrees/<slug>` — one workspace worktree's root. */
export function worktreePath(mainRoot: string, slug: string): string {
  return path.join(worktreesDir(mainRoot), slug)
}

/** Reads `.haus-worktree.json` from a workspace worktree root; `undefined` if absent/malformed. */
export async function readWorktreeState(worktreeRoot: string): Promise<WorktreeState | undefined> {
  return readJson<WorktreeState>(path.join(worktreeRoot, WORKTREE_STATE_FILE))
}

/** Writes `.haus-worktree.json` at the workspace worktree root. */
export async function writeWorktreeState(
  worktreeRoot: string,
  state: WorktreeState,
): Promise<void> {
  await writeJson(path.join(worktreeRoot, WORKTREE_STATE_FILE), state)
}
