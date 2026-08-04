# ADR-0018: `haus clone` conflict detection, menu pagination, and clone mode prompt

- **Status:** Accepted | **Date:** 2026-08-04
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/commands/clone.ts`, `library/global/skills/haus-workflow/SKILL.md`, `library/global/skills/haus-workflow/references/clone.md`
- **Related:** [docs/plans/field-reports-docs-menu-clone.md](../plans/field-reports-docs-menu-clone.md) (Tasks B, C, D)

## Context

Three user-reported issues, all in how `haus-workflow`'s conversational menu and clone flow behave:

1. The no-arg menu only ever offered 8 of the 12 tasks in the alias table — `project:doctor`, `project:fix`, `install`, and `uninstall` had no guided path, reachable only by already knowing their exact name.
2. `project:clone`/`project:cloneandsetup` picked single-repo-vs-workspace mode purely by whether a `name` argument was present. Reached via the menu (or a bare `project:clone` with no argument), no name is ever known, so it silently defaulted to workspace mode regardless of what the user wanted.
3. `haus clone` treated any pre-existing target directory as "already cloned, skip" on name alone — a same-named unrelated directory (or a previous failed/partial clone attempt) produced a false-positive skip with no way to tell the difference.

## Decision

1. **Menu pagination: batches of 3 + a "More options" continuation, not a fixed page count.** Each non-final `AskUserQuestion` shows 3 real tasks and a 4th "More options" option naming what's next; the final page shows the remaining ≤4 tasks with no continuation slot. This is deliberately not "2 fixed questions of 4" (the old shape) — a fixed count silently drops tasks again the next time the alias table grows. The 3-per-page batching is chosen so a `[—] More options` slot always fits within `AskUserQuestion`'s 4-option cap alongside 3 real choices.

2. **Clone mode is asked explicitly, not inferred, whenever no name is already known.** `clone.md` gained a Step 0: "Clone a single repo, or a whole workspace?" — asked before either Mode A (GitHub search by name) or Mode B (workspace manifest) runs, in every path that doesn't already have a name (menu selection, or a bare `project:clone`/`clone`). When a name **is** already given as an argument, this step is skipped entirely — behavior for that path is unchanged, so existing direct invocations (`/haus-workflow project:clone myrepo`) are unaffected.

3. **A conflicting target directory refuses, rather than silently skipping.** `haus clone` now distinguishes three cases via the target's git `origin` remote: (a) matches the requested URL → skip silently, unchanged from before; (b) exists but isn't a git repository, or is a git repo with a different/no matching origin → refuse with a clear message naming the mismatch, non-zero exit. Comparison is normalized (`normalizeGitUrl`) so an SSH remote and its HTTPS equivalent, or a `.git` suffix difference, don't produce a false conflict.

4. **`--dry-run` reports a detected conflict but does not fail the run.** Matches this codebase's existing dry-run convention (`apply.ts`'s empty-cache-in-dry-run branch only warns, never sets `exitCode`) — dry-run's job is to preview and surface problems, not to gate. Only a real (non-dry-run) attempt sets a non-zero exit on conflict.

## Motivation (why)

- The menu-pagination and clone-mode fixes both come from the same root cause: treating "how the user reaches a task" as equivalent to "what arguments they've supplied" — the menu only ever supplies a task _label_, never the parameters that label's underlying procedure needs. Fixing this at the procedure level (clone.md's Step 0) rather than trying to have the menu itself collect every possible parameter keeps the menu simple and keeps parameter-collection logic next to the code that actually needs the parameter.
- Silently skipping on name-only existence (decision 3) is the same failure shape doctor/apply's stale-item advisory and `apply --prune` (ADR-0017) were built to avoid: a filesystem state that _looks_ fine but isn't actually verified against what it's supposed to represent.

## Alternatives considered

- **Have the menu itself ask for a clone name/mode before dispatching** — rejected; would duplicate clone.md's own Mode A/B logic in two places (menu-level pre-ask, procedure-level dispatch) that could drift. A single Step 0 inside the procedure that runs regardless of entry point is one source of truth.
- **Treat any existing target as fatal, even a genuine prior clone** — rejected; would break the documented idempotent-rerun behavior (`project:clone` run twice on purpose, or `cloneandsetup` re-run after a partial failure) that existing tests already rely on. Origin-matching preserves idempotency for the case that's actually safe.
- **Set a non-zero exit on a dry-run conflict too** ("a real problem is a real problem regardless of dry-run") — considered, then reverted after review found it deviates from this codebase's own established dry-run contract elsewhere (`apply.ts`). Consistency with an existing convention won over an isolated judgment call for this one command.

## Consequences

- Reaching `project:clone`/`project:cloneandsetup` via the menu now costs one extra question (the mode ask) compared to typing the command with a name directly — an intentional, small friction trade for correctness over silently guessing wrong.
- `haus clone`'s exit code is no longer purely "did the `git clone` subprocess succeed" — a pre-existing, non-matching target is also a failure condition. Any caller (scripts, CI) treating a 0 exit as "repo is present and correct" was already implicitly relying on this; it's now actually true.
- The menu's page count is coupled to the alias table's size only informally (via the "and N more" counts written as prose, not computed) — `tests/haus-workflow-skill.test.js` now asserts those counts arithmetically, but adding a 13th task still requires a human to re-batch the pages by hand, not an automatic reflow.
