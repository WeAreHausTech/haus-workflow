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
 * - **Idempotent:** an existing target directory is left untouched (clone skipped).
 * - `--dry-run` prints the intended action and changes nothing.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { runGit } from '../utils/exec.js'
import { error, log } from '../utils/logger.js'

export type CloneOptions = {
  /** Target directory (default: repo name derived from the URL, under cwd). */
  dir?: string
  dryRun?: boolean
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
    log(`• ${path.basename(target)} already present at ${target} — skipped`)
    return
  }

  if (opts.dryRun) {
    log(`would clone ${url} → ${target}`)
    return
  }

  const res = await runGit(['clone', url, target])
  if (res.exitCode !== 0) {
    error(`clone failed for ${url}: ${(res.stderr || res.stdout).trim()}`)
    process.exitCode = 1
    return
  }
  log(`✓ cloned ${url} → ${target}`)
}
