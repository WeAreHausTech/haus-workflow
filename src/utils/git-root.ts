/**
 * Worktree-safe git root resolution.
 *
 * Every haus command today roots on `process.cwd()` with no concept of a linked
 * git worktree — so running haus inside a Claude-Code-created worktree (or any
 * `git worktree add`ed checkout) silently treats that worktree as the whole repo.
 * `resolveRoots()` distinguishes a linked worktree from its main checkout via
 * `--git-dir` vs `--git-common-dir`, so callers that need the "real" repo (e.g.
 * for naming) can use `mainRoot` instead of a worktree slug.
 *
 * See docs/plans/workspace-worktree-materialization.md — Task 1.
 */
import path from 'node:path'

import { runGit } from './exec.js'

/** Resolved git root information for a given starting directory. */
export type RootInfo = {
  /** The directory resolution started from. */
  cwd: string
  /** `git rev-parse --show-toplevel` — the working tree root. */
  repoRoot: string
  /** Absolute `git rev-parse --git-dir`. */
  gitDir: string
  /** Absolute `git rev-parse --git-common-dir`. */
  gitCommonDir: string
  /** True when `gitDir !== gitCommonDir` — the only reliable linked-worktree signal. */
  isLinkedWorktree: boolean
  /** `repoRoot` when not a linked worktree; otherwise the main checkout's root. */
  mainRoot: string
  /** `basename(gitDir)` when `isLinkedWorktree`; otherwise null. */
  worktreeName: string | null
  /** False for a non-git directory or a bare repo (no usable toplevel). */
  isGitRepo: boolean
}

/** All-cwd fallback for a non-git directory or a bare repo. Never throw. */
function fallback(start: string): RootInfo {
  return {
    cwd: start,
    repoRoot: start,
    gitDir: '',
    gitCommonDir: '',
    isLinkedWorktree: false,
    mainRoot: start,
    worktreeName: null,
    isGitRepo: false,
  }
}

/**
 * Resolves `--git-common-dir` to an absolute path.
 *
 * Prefers `--path-format=absolute` (git >= 2.31). Older git ignores the unknown
 * flag and prints the plain (often relative, e.g. `.git`) path instead — detected
 * by checking whether the result is already absolute, falling back to resolving
 * it against `repoRoot` when it isn't.
 */
async function resolveAbsoluteGitPath(
  flag: '--git-dir' | '--git-common-dir',
  cwd: string,
  repoRoot: string,
): Promise<string> {
  const withFormat = await runGit(['rev-parse', '--path-format=absolute', flag], { cwd })
  const raw = withFormat.exitCode === 0 ? withFormat.stdout.trim() : ''
  // path.resolve() on an already-absolute path normalizes its separators to the
  // current platform's — git can print forward slashes on Windows (e.g.
  // `C:/Users/...`) while downstream code joins paths with path.join()'s
  // backslashes, which would otherwise break string-based checks like startsWith().
  if (raw && path.isAbsolute(raw)) return path.resolve(raw)

  // Fallback for git < 2.31: `--path-format` is unrecognized, so re-run without it.
  const plain = await runGit(['rev-parse', flag], { cwd })
  const plainRaw = plain.exitCode === 0 ? plain.stdout.trim() : ''
  if (!plainRaw) return ''
  return path.isAbsolute(plainRaw) ? path.resolve(plainRaw) : path.resolve(repoRoot, plainRaw)
}

/**
 * Resolves worktree-safe root information for `start` (defaults to `process.cwd()`).
 * Never throws — a non-git directory, a bare repo, OR git itself being unspawnable
 * (missing binary, minimal environment) all return an all-`cwd` fallback with
 * `isGitRepo: false`, letting callers fall back to today's behavior. `runGit()`
 * only returns a non-zero exit code for a git command that ran and failed; it
 * still throws if the `git` process itself can't be spawned at all (per its own
 * doc comment in exec.ts) — the try/catch below is what actually makes good on
 * this function's "never throws" promise for that case, not just exit codes.
 */
export async function resolveRoots(start?: string): Promise<RootInfo> {
  const cwd = start ?? process.cwd()

  try {
    const toplevel = await runGit(['rev-parse', '--show-toplevel'], { cwd })
    if (toplevel.exitCode !== 0) return fallback(cwd)
    const toplevelRaw = toplevel.stdout.trim()
    if (!toplevelRaw) return fallback(cwd)
    // Normalize separators — see the matching comment in resolveAbsoluteGitPath().
    const repoRoot = path.resolve(toplevelRaw)

    const [gitDir, gitCommonDir] = await Promise.all([
      resolveAbsoluteGitPath('--git-dir', cwd, repoRoot),
      resolveAbsoluteGitPath('--git-common-dir', cwd, repoRoot),
    ])
    if (!gitDir || !gitCommonDir) return fallback(cwd)

    const isLinkedWorktree = gitDir !== gitCommonDir

    // Submodule guard: a submodule's gitDir lives under `<parent>/.git/modules/<name>`,
    // where `dirname(gitCommonDir)` would resolve to the wrong directory. Only derive
    // mainRoot from gitCommonDir when it actually ends in `.git` (the main-checkout shape).
    const mainRoot =
      isLinkedWorktree && path.basename(gitCommonDir) === '.git'
        ? path.dirname(gitCommonDir)
        : repoRoot

    const worktreeName = isLinkedWorktree ? path.basename(gitDir) : null

    return {
      cwd,
      repoRoot,
      gitDir,
      gitCommonDir,
      isLinkedWorktree,
      mainRoot,
      worktreeName,
      isGitRepo: true,
    }
  } catch {
    // git itself couldn't be spawned (not installed, or a minimal/sandboxed
    // environment) — fall back exactly as if this weren't a git repo, rather
    // than propagating a crash into scan/setup/doctor callers that assumed
    // this function never throws.
    return fallback(cwd)
  }
}
