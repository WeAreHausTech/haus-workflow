/** Git change signal for the recommender: surfaces changed files to mark active work areas. */

import { runGit } from '../utils/exec.js'

// Each call is independently fault-isolated: a timeout or error on one git command
// (e.g. under heavy concurrent load) must not drop the other two calls' results.
async function runGitLines(root: string, args: string[]): Promise<string[]> {
  try {
    const result = await runGit(args, { cwd: root, timeout: 3000 })
    if (result.exitCode !== 0) return []
    return result.stdout
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Reads changed files from git — unstaged diffs, staged diffs, and untracked files —
 * so rules touching any currently active work area become eligible, not just files
 * with unstaged edits.
 */
export async function readChangedFiles(root: string): Promise<string[]> {
  if (process.env.HAUS_DISABLE_GIT_SIGNALS === '1') return []
  const [unstaged, staged, untracked] = await Promise.all([
    runGitLines(root, ['diff', '--name-only']),
    runGitLines(root, ['diff', '--cached', '--name-only']),
    runGitLines(root, ['ls-files', '--others', '--exclude-standard']),
  ])
  return [...new Set([...unstaged, ...staged, ...untracked])].sort()
}
