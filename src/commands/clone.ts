/**
 * `haus clone <url> [dir]` — clone a single git repository by URL.
 *
 * A primitive with no workspace knowledge: it clones one repo and nothing more.
 * Orchestration (looping over a workspace's `repos.manifest.json`, honoring
 * `repos.local.json` overrides, or finding a repo by name on GitHub) lives in the
 * `project:clone` skill, which calls this command once per repo.
 *
 * Behaviour:
 * - Target defaults to a folder named after the repo (URL basename, sans `.git`),
 *   resolved against the current working directory; pass `[dir]` to override.
 * - **Idempotent:** an existing target directory whose `origin` remote already
 *   matches `url` is left untouched (clone skipped). An existing target that is
 *   *not* a matching clone (a different repo, or not a git repo at all) is a
 *   conflict — refused with a non-zero exit rather than silently skipped, so a
 *   same-named unrelated directory is never mistaken for an already-cloned repo.
 * - `--dry-run` prints the intended action (or a detected conflict) and changes
 *   nothing; a conflict is still reported, but does not fail a dry run — only a
 *   real attempt does.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { runGit } from '../utils/exec.js'
import { error, log, warn } from '../utils/logger.js'

export type CloneOptions = {
  /** Target directory (default: repo name derived from the URL, under cwd). */
  dir?: string
  dryRun?: boolean
}

/**
 * Env vars that pin git to an existing repo's location. They are exported by git
 * when running hooks (e.g. pre-push) and are present when `haus clone` runs inside
 * a repo — inherited, they redirect `git clone` into the wrong .git/worktree and
 * corrupt the result. Scrubbed for the clone subprocess; auth/transport vars
 * (GIT_SSH_COMMAND, GIT_ASKPASS, …) are deliberately kept so cloning still works.
 */
const GIT_LOCATION_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
]

/** A copy of process.env with repo-location GIT_* vars removed (see GIT_LOCATION_VARS). */
function cloneEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of GIT_LOCATION_VARS) delete env[key]
  return env
}

/** Derive a target folder name from a git URL — its last path segment without `.git`. */
export function repoNameFromUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
  const tail = trimmed.split(/[/:]/).pop() ?? ''
  return tail || 'repo'
}

/**
 * Normalize a git URL to a bare `host/path` form for comparison — strips scheme
 * (`https://`, `ssh://`, `git://`), a leading `user@` (SSH auth or scp-like syntax),
 * a trailing `.git`, and trailing slashes, then lowercases. Lets an SSH remote
 * (`git@github.com:org/repo.git`) and its HTTPS equivalent
 * (`https://github.com/org/repo`) compare as the same repo.
 *
 * Two known limitations, both accepted because this is used only as a heuristic
 * to avoid a false "already cloned" skip, on GitHub URLs (github.com routing is
 * itself case-insensitive, and `haus clone`'s own callers — `clone.md`'s GitHub
 * search — never produce a port in the URL):
 * - Lowercasing means a case-sensitive self-hosted git host with two distinct
 *   repos differing only by case would wrongly compare equal.
 * - An explicit port before the path (`ssh://host:2222/org/repo`) collapses into
 *   the path rather than being dropped, so it could collide with an unrelated
 *   repo actually located at a path matching that port number.
 */
export function normalizeGitUrl(url: string): string {
  let s = url.trim()
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') // strip scheme://
  s = s.replace(/^[^/@]+@/, '') // strip user@ (both ssh:// form and scp-like)
  s = s.replace(/:(?=[^/])/, '/') // scp-like host:path → host/path (not a port)
  // Trailing slash(es) stripped BEFORE the .git suffix check — "repo.git/" ends in
  // "/", not ".git", so checking .git first would miss it and leave ".git" behind,
  // comparing unequal to the same repo's slash-less/no-.git form.
  s = s.replace(/\/+$/, '')
  s = s.replace(/\.git$/i, '')
  return s.toLowerCase()
}

type ExistingTargetCheck =
  { kind: 'matches' } | { kind: 'not-a-repo' } | { kind: 'different-repo'; origin: string | null }

/** Classifies an existing `target` directory relative to the repo `url` we'd clone. */
async function checkExistingTarget(target: string, url: string): Promise<ExistingTargetCheck> {
  const isRepo = await runGit(['-C', target, 'rev-parse', '--is-inside-work-tree'], {
    env: cloneEnv(),
    extendEnv: false,
  })
  if (isRepo.exitCode !== 0) return { kind: 'not-a-repo' }
  const origin = await runGit(['-C', target, 'remote', 'get-url', 'origin'], {
    env: cloneEnv(),
    extendEnv: false,
  })
  if (origin.exitCode !== 0) return { kind: 'different-repo', origin: null }
  const originUrl = origin.stdout.trim()
  if (normalizeGitUrl(originUrl) === normalizeGitUrl(url)) return { kind: 'matches' }
  return { kind: 'different-repo', origin: originUrl }
}

/**
 * Clone a single repository.
 *
 * @param url - The git URL to clone.
 * @param opts - Target directory + dry-run flag.
 */
export async function runClone(url: string, opts: CloneOptions = {}): Promise<void> {
  if (!url || !url.trim()) {
    error('A git URL is required: `haus clone <url> [dir]`.')
    process.exitCode = 1
    return
  }

  const target = path.resolve(opts.dir?.trim() || repoNameFromUrl(url))

  if (existsSync(target)) {
    const check = await checkExistingTarget(target, url)
    if (check.kind === 'matches') {
      log(`• ${path.basename(target)} already cloned here, matches ${url} — skipped`)
      return
    }
    const message =
      check.kind === 'not-a-repo'
        ? `${target} already exists and is not a git repository — refusing to clone ${url} there. Remove or rename it, or pass a different [dir].`
        : `${target} already exists as a different repository (origin: ${check.origin ?? '(no origin remote)'}) — refusing to clone ${url} there. Remove or rename it, or pass a different [dir].`
    // Matches this codebase's dry-run convention (see apply.ts): dry-run reports a
    // real problem but does not fail the run — only a non-dry-run attempt does.
    if (opts.dryRun) {
      warn(`[dry-run] ${message}`)
      return
    }
    error(message)
    process.exitCode = 1
    return
  }

  if (opts.dryRun) {
    log(`would clone ${url} → ${target}`)
    return
  }

  // `--` terminates option parsing so a URL/path beginning with `-` is treated as
  // a positional, never as a git flag (argument injection). No shell is involved
  // (argv is passed directly to execa), so this is the only injection vector.
  const res = await runGit(['clone', '--', url, target], { env: cloneEnv(), extendEnv: false })
  if (res.exitCode !== 0) {
    error(`clone failed for ${url}: ${(res.stderr || res.stdout).trim()}`)
    process.exitCode = 1
    return
  }
  log(`✓ cloned ${url} → ${target}`)
}
