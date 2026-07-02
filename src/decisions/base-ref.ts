/** Resolves the base ref a feature branch should be diffed against for PR-time checks. */
import { runGit } from '../utils/exec.js'

/**
 * Prefers the remote's configured default branch (`origin/HEAD`), then falls
 * back to a local `main`/`master`. Returns `undefined` when none resolve so
 * callers can fail open rather than block on an ambiguous base — an
 * unresolvable base is a repo-shape problem, not evidence of a missing ADR.
 */
export async function resolveBaseRef(root: string): Promise<string | undefined> {
  const symbolic = await runGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: root })
  if (symbolic.exitCode === 0) {
    const ref = symbolic.stdout.trim().replace(/^refs\/remotes\//, '')
    if (ref) return ref
  }
  for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
    const check = await runGit(['rev-parse', '--verify', '--quiet', candidate], { cwd: root })
    if (check.exitCode === 0) return candidate
  }
  return undefined
}
