/**
 * Low-level `git worktree` plumbing shared by add/remove/list/doctor.
 *
 * Every function here takes an explicit `cwd` (the repo the git invocation runs
 * against — the workspace root or a member's `absPath`) and never fetches over
 * the network: member repos may live on different hosts with different auth, so
 * branch resolution here is limited to local refs (`refs/heads/*`,
 * `refs/remotes/origin/HEAD` already cached from a prior fetch/clone) only. See
 * docs/plans/workspace-worktree-materialization.md — Task 4.
 */
import { runGit } from '../../utils/exec.js'

/** True when `branch` already exists as a local branch in `cwd`. */
export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const result = await runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd })
  return result.exitCode === 0
}

export type DefaultBranchSource = 'origin-head' | 'local-main' | 'local-master'

/**
 * Resolve a repo's default branch without ever fetching: prefers the cached
 * `refs/remotes/origin/HEAD` symbolic ref, then falls back to a local `main`,
 * then a local `master`. Returns `undefined` when none of the three exist.
 */
export async function resolveDefaultBranch(
  cwd: string,
): Promise<{ ref: string; source: DefaultBranchSource } | undefined> {
  const symbolic = await runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd })
  if (symbolic.exitCode === 0 && symbolic.stdout.trim()) {
    return { ref: symbolic.stdout.trim(), source: 'origin-head' }
  }
  if (await branchExists(cwd, 'main')) return { ref: 'main', source: 'local-main' }
  if (await branchExists(cwd, 'master')) return { ref: 'master', source: 'local-master' }
  return undefined
}

const CHECKED_OUT_ELSEWHERE_PATTERNS = [/already checked out at/i, /already used by worktree/i]

/** True when `stderr` is git's "this branch is already checked out in another worktree" error. */
export function isBranchCheckedOutElsewhereError(stderr: string): boolean {
  return CHECKED_OUT_ELSEWHERE_PATTERNS.some((re) => re.test(stderr))
}

export type WorktreeAddOutcome = {
  ok: boolean
  branchAction: 'checkout' | 'create'
  startPoint?: string
  stderr?: string
  /**
   * Git refuses to check out the same branch into two worktrees at once. This is
   * caught and surfaced as a clear, specific error rather than silently guessing
   * a suffixed branch name (plan doc Task 4 pitfall #1).
   */
  checkedOutElsewhere?: boolean
}

/**
 * `git -C cwd worktree add <worktreePath> [-b] <branch>` — checks out `branch` if
 * it already exists locally, otherwise creates it. `preferDefaultBranchFrom: true`
 * (used for member repos, never the workspace repo) resolves a start-point via
 * {@link resolveDefaultBranch} when the branch has to be created, so a *new*
 * mirrored branch in a member repo starts from that member's own default branch
 * rather than whatever commit `HEAD` happens to be on.
 */
export async function addWorktree(
  cwd: string,
  worktreePath: string,
  branch: string,
  opts: { preferDefaultBranchFrom?: boolean } = {},
): Promise<WorktreeAddOutcome> {
  const exists = await branchExists(cwd, branch)
  if (exists) {
    const result = await runGit(['worktree', 'add', worktreePath, branch], { cwd })
    return {
      ok: result.exitCode === 0,
      branchAction: 'checkout',
      stderr: result.exitCode === 0 ? undefined : result.stderr,
      checkedOutElsewhere: result.exitCode !== 0 && isBranchCheckedOutElsewhereError(result.stderr),
    }
  }

  let startPoint: string | undefined
  if (opts.preferDefaultBranchFrom) {
    const defaultBranch = await resolveDefaultBranch(cwd)
    startPoint = defaultBranch?.ref
  }
  const args = startPoint
    ? ['worktree', 'add', worktreePath, '-b', branch, startPoint]
    : ['worktree', 'add', worktreePath, '-b', branch]
  const result = await runGit(args, { cwd })
  return {
    ok: result.exitCode === 0,
    branchAction: 'create',
    startPoint,
    stderr: result.exitCode === 0 ? undefined : result.stderr,
    checkedOutElsewhere: result.exitCode !== 0 && isBranchCheckedOutElsewhereError(result.stderr),
  }
}

/** `git -C ownerRepo worktree remove <worktreePath> [--force]`. */
export async function removeWorktree(
  ownerRepo: string,
  worktreePath: string,
  force = true,
): Promise<{ ok: boolean; stderr?: string }> {
  const args = ['worktree', 'remove', worktreePath]
  if (force) args.push('--force')
  const result = await runGit(args, { cwd: ownerRepo })
  return { ok: result.exitCode === 0, stderr: result.exitCode === 0 ? undefined : result.stderr }
}

/** `git -C ownerRepo worktree prune` — clears stale registrations after a manual/failed remove. */
export async function pruneWorktrees(ownerRepo: string): Promise<void> {
  await runGit(['worktree', 'prune'], { cwd: ownerRepo })
}

export type WorktreeListEntry = {
  path: string
  branch?: string
  head?: string
  bare?: boolean
  detached?: boolean
}

/** Parses `git worktree list --porcelain` into structured entries. */
export async function listWorktrees(ownerRepo: string): Promise<WorktreeListEntry[]> {
  const result = await runGit(['worktree', 'list', '--porcelain'], { cwd: ownerRepo })
  if (result.exitCode !== 0) return []

  const entries: WorktreeListEntry[] = []
  let current: Partial<WorktreeListEntry> = {}
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) entries.push(current as WorktreeListEntry)
      current = { path: line.slice('worktree '.length).trim() }
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '').trim()
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim()
    } else if (line === 'bare') {
      current.bare = true
    } else if (line === 'detached') {
      current.detached = true
    }
  }
  if (current.path) entries.push(current as WorktreeListEntry)
  return entries
}

/** `git -C cwd rev-parse --abbrev-ref HEAD`, or `undefined` if it fails. */
export async function currentBranch(cwd: string): Promise<string | undefined> {
  const result = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
  return result.exitCode === 0 ? result.stdout.trim() : undefined
}

/**
 * True when `git status --porcelain` in `cwd` reports any change (staged,
 * unstaged, or untracked).
 *
 * @param ignorePaths - Paths to exclude from the check via a `:!`-magic
 *   pathspec — used to exclude haus's own `.haus-worktree.json` state file
 *   from the workspace worktree's dirty-check: it's an untracked file *we*
 *   write there, not user work, and would otherwise make every fresh worktree
 *   look "dirty" and refuse `remove` unconditionally.
 */
export async function hasUncommittedChanges(
  cwd: string,
  ignorePaths: string[] = [],
): Promise<boolean> {
  const args = ['status', '--porcelain']
  if (ignorePaths.length > 0) {
    args.push('--', '.', ...ignorePaths.map((p) => `:!${p}`))
  }
  const result = await runGit(args, { cwd })
  return result.exitCode === 0 && result.stdout.trim().length > 0
}

export type UnpushedCheck = { unpushed: false } | { unpushed: true; reason: string }

/**
 * Best-effort "is there unpushed work here" check, used to gate `remove` by
 * default (plan doc: "this is a WORKFLOW.md NEVER-rule-equivalent, not a nicety").
 *
 * With an upstream configured: unpushed iff `HEAD` is ahead of it.
 * Without an upstream: there is no remote to compare against, so this errs
 * toward refusing — unpushed unless `HEAD` is exactly the resolved default
 * branch's commit (i.e. the branch was created but never advanced, so there is
 * nothing unique to lose). If the default branch itself can't be resolved
 * either, the check can't be verified either way and does not block removal.
 */
export async function hasUnpushedWork(cwd: string): Promise<UnpushedCheck> {
  const upstream = await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], {
    cwd,
  })
  if (upstream.exitCode === 0 && upstream.stdout.trim()) {
    const upstreamRef = upstream.stdout.trim()
    const ahead = await runGit(['rev-list', '--count', `${upstreamRef}..HEAD`], { cwd })
    const count = Number.parseInt(ahead.stdout.trim(), 10)
    if (Number.isFinite(count) && count > 0) {
      return { unpushed: true, reason: `${count} commit(s) ahead of ${upstreamRef}` }
    }
    return { unpushed: false }
  }

  const defaultBranch = await resolveDefaultBranch(cwd)
  if (!defaultBranch) return { unpushed: false } // unknowable; don't block on it

  const [head, defaultSha] = await Promise.all([
    runGit(['rev-parse', 'HEAD'], { cwd }),
    runGit(['rev-parse', defaultBranch.ref], { cwd }),
  ])
  if (
    head.exitCode === 0 &&
    defaultSha.exitCode === 0 &&
    head.stdout.trim() === defaultSha.stdout.trim()
  ) {
    return { unpushed: false }
  }
  return {
    unpushed: true,
    reason: `no upstream tracking branch configured, and HEAD differs from ${defaultBranch.ref}`,
  }
}
