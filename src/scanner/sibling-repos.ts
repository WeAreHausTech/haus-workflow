/**
 * D2 (docs/plans/workspace-detection-and-permissions-fixes.md, Task 3.1): detect
 * whether the current root sits on top of 2+ independent sibling repos and, if so,
 * suggest `haus workspace discover` as the better entry point instead of running
 * `setup-project`/`scan` per repo, blind to the workspace pattern.
 *
 * Reuses `discoverRepos`'s existing marker/glob logic
 * (`src/commands/workspace/discover.ts`) rather than re-implementing repo-root
 * detection.
 *
 * IMPORTANT: this must be called from the command layer (`scan.ts` / `setup-core.ts`),
 * never from inside `scanProject` itself. `discoverRepos` calls `scanProject` once per
 * discovered repo root — including the passed-in root itself when it has its own
 * `.git` (fast-glob's `**\/.git` matches the root's own `.git` too, dirname `.`).
 * Calling this helper from within `scanProject` would recurse into `scanProject`
 * calling itself for the same root.
 */
import { discoverRepos } from '../commands/workspace/discover.js'

export const SIBLING_REPO_WARNING =
  'Multiple sibling repos detected under this root — consider "haus workspace discover" ' +
  'instead of running setup-project/scan per repo.'

/**
 * True when `root` has 2 or more independent repo roots nested below it (the root's
 * own path, `.`, is excluded from the count). Never throws — a discovery failure
 * (e.g. a permission error deep in the tree) is swallowed since this is a
 * supplementary hint, not load-bearing detection; the caller's normal scan/setup
 * result is unaffected either way.
 */
export async function hasMultipleSiblingRepos(root: string): Promise<boolean> {
  try {
    const discovered = await discoverRepos(root)
    return discovered.filter((repo) => repo.path !== '.').length >= 2
  } catch {
    return false
  }
}
