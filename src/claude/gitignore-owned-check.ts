/**
 * Shared `.claude/`/`.haus-workflow/` gitignore-awareness check — used by both
 * `haus doctor` and `haus apply --write`'s final summary (a fresh install is
 * when this matters most: an accidentally-gitignored `.claude/` makes an
 * entire catalog install invisible to git-tracked state right after it
 * finishes). Lives here, not in either command file, because `src/commands/`
 * files never import each other (see docs/architecture.md) and this logic
 * previously drifted as two separate copies — see Task 1.3 (D5) in
 * docs/plans/workspace-detection-and-permissions-fixes.md.
 */
import { runGit } from '../utils/exec.js'

/**
 * Repo-relative paths of haus-owned, git-*tracked* content (skills/agents/commands
 * under `.claude/`, plus `.haus-workflow/` itself — WORKFLOW.md, workflow-config.md,
 * etc.) that must never be gitignored. This is the opposite concern from
 * `write-gitignore.ts`'s `GITIGNORED_ARTIFACT_PATHS` (machine-local *scan artifacts*
 * that must stay untracked): if any of these come back ignored instead, an entire
 * catalog install becomes invisible to anything relying on git-tracked state — the
 * reporter's actual failure mode (80 skills written, none visible).
 */
export const HAUS_OWNED_TRACKED_PATHS = [
  '.claude',
  '.claude/skills',
  '.claude/agents',
  '.claude/commands',
  '.haus-workflow',
] as const

/**
 * Repo-relative paths (among `HAUS_OWNED_TRACKED_PATHS`) currently covered by a
 * `.gitignore` rule at `root`, via `git check-ignore`. Returns an empty array — never
 * throws — when `root` isn't a git repository, git is unavailable, or the check
 * errors/times out; callers treat that the same as "nothing ignored" rather than
 * surfacing a spurious failure for an orthogonal git problem.
 */
export async function findGitignoredHausPaths(root: string): Promise<string[]> {
  try {
    const result = await runGit(['check-ignore', '--', ...HAUS_OWNED_TRACKED_PATHS], {
      cwd: root,
      timeout: 5000,
    })
    // check-ignore exits 0 when at least one of the given paths is ignored, 1 when
    // none are — both are normal outcomes. Anything else (128 = not a repo/fatal
    // error) means the check didn't run meaningfully; treat as "nothing ignored".
    if (result.exitCode !== 0 && result.exitCode !== 1) return []
    return [
      ...new Set(
        result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ]
  } catch {
    return []
  }
}

/** Collapse raw ignored `HAUS_OWNED_TRACKED_PATHS` matches into their top-level dirs
 * (`.claude/` and/or `.haus-workflow/`) for a readable warning. */
export function summarizeGitignoredHausDirs(paths: string[]): string[] {
  const dirs = new Set<string>()
  for (const p of paths) dirs.add(p === '.haus-workflow' ? '.haus-workflow/' : '.claude/')
  return [...dirs]
}
