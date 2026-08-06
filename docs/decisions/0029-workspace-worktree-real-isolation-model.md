# ADR-0029: Workspace worktree materialization — real git-worktree-per-member isolation, not symlinks

- **Status:** Proposed | **Date:** 2026-08-05
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/workspace/worktree/*` (`add.ts`, `hydrate.ts`, `cow-copy.ts`, `install.ts`, `remove.ts`, `list.ts`, `doctor.ts`, `git-worktree.ts`, `root.ts`, `select-members.ts`, `state.ts`, `local-files.ts`), `src/commands/workspace/worktree.ts`, `src/claude/merge-project-settings.ts` (`hook.workspace.worktree-check`)
- **Related:** [docs/plans/workspace-worktree-materialization.md](../plans/workspace-worktree-materialization.md) (Task 4, Task 5); [ADR-0026](0026-workspace-member-config-bridge-not-consolidation.md) (`readMembers()`, the config source `worktree add` enumerates); [ADR-0028](0028-workspace-cross-repo-context-copy-vs-symlink.md) (this codebase's separate, sibling decision to copy rather than symlink for cross-repo skill/agent/command visibility — a different feature, same "prefer real materialization over a link" instinct, arrived at independently for its own reasons)

## Context

A multi-repo "workspace" (a meta-repo plus gitignored sibling member-repo clones) has no way to get an isolated, runnable checkout of the whole workspace on a feature branch. `git worktree add` on the meta-repo alone only checks out tracked files — member repos, being gitignored siblings, never materialize there, so a plain worktree of the meta-repo is an empty shell missing every dependency it needs to actually build or test anything (this is Defect B from the parent plan's analysis, and the root cause behind the vafab-workspace `context-map.json` corruption incident that ADR-0025 addresses on the sibling side).

Two isolation strategies were on the table: symlink each member repo into the workspace worktree (pointing back at the main checkout), or give each member repo its own real `git worktree` checked out on a mirrored branch.

## Decision

**Real isolation — one `git worktree` per member repo, not symlinks.** `haus workspace worktree add <slug>` creates:

1. A workspace-level worktree of the meta-repo at `.claude/worktrees/<slug>`, on a branch that defaults to the slug (`git -C <mainRoot> worktree add ... -b <branch>`, checking out the branch instead of creating it if it already exists).
2. Per member, a real `git worktree add` at `<workspaceWorktree>/<member.folder>`, on the **same mirrored branch name** — created from the member's own default branch (read via `git symbolic-ref refs/remotes/origin/HEAD`, falling back to local `main` then `master`) if that branch doesn't already exist in the member repo. Network fetches are never performed — `worktree add` is a fully local operation, and member repos in a real workspace can live on different git hosts with different auth (Azure DevOps, GitHub), so silently trying to fetch would be a surprising, possibly-failing side effect.

This is implemented in `src/workspace/worktree/add.ts` (orchestration), `git-worktree.ts` (the `git worktree add`/branch-resolution primitives), and `select-members.ts`/`root.ts` (enumerating and locating members via ADR-0026's `readMembers()`).

Each member worktree is then genuinely isolated: independent working-tree files, independent branch checkout, independent uncommitted changes — while sharing the same object store as the main checkout (this is `git worktree`'s own behavior, not something haus builds; checkouts are consequently near-free on top of an existing clone).

### Hydration: copy-on-write clone, then install-reconciliation

A fresh `git worktree` only gets tracked files — `node_modules`, `vendor`, `.NET` `obj`/`bin`, and similar untracked build/dependency directories still need to exist for the worktree to be runnable. Re-running a full install in every worktree is correct but slow (multi-hundred-MB downloads per worktree, per member). The chosen two-step hydration (`src/workspace/worktree/hydrate.ts`):

1. **Copy-on-write clone** of `HYDRATION_TARGETS = ['node_modules', 'vendor', 'obj', 'bin']` from the main checkout into the worktree, via `cowCopyDir()` in `src/workspace/worktree/cow-copy.ts`.
2. **Install-reconciliation** against the branch's own lockfile (`install.ts`) — always a real install command, never skipped, so a CoW clone that predates a lockfile change on this branch gets corrected. Members hydrate in parallel (independent of each other).

**CoW justification, per the plan's measurement:** on macOS/APFS, `cp -c` clones vafab-forms's 310 MB `node_modules` in 2.9s with an actual disk delta of 5 MB — the filesystem shares blocks until something writes, which is genuine copy-on-write isolation (unlike a hardlink, a write in one worktree never leaks into another). `git worktree` already makes the tracked-file checkout itself close to free by sharing the object store; CoW cloning the untracked dependency trees is what makes full per-worktree isolation actually cheap enward practice instead of only in principle.

**Shipped fallback behavior confirmed against `src/workspace/worktree/cow-copy.ts`** (not restated blind from the plan — read directly before writing this ADR):

- `detectCowStrategy()` probes the actual filesystem backing the destination directory before attempting anything:
  - macOS: shells out to `df`/`mount` to read the volume's reported type; only `apfs` returns `'darwin-clonefile'` (`cp -c -R`). Any other macOS filesystem returns `'unsupported'`.
  - Linux: `stat -f -c %T <dir>`; only `btrfs` or `xfs` returns `'linux-reflink'` (`cp -a --reflink=auto -R`). Anything else — including ext4 — returns `'unsupported'`.
  - Any other `process.platform` returns `'unknown-platform'`.
- `cowCopyDir()` treats both `'unsupported'` and `'unknown-platform'` identically: it returns `{ attempted: false, ok: false }` **without invoking `cp` at all**, rather than letting `--reflink=auto` silently fall back to a full byte-for-byte copy with no signal that CoW didn't actually happen. This matches the plan's explicit instruction ("a silent 310 MB copy is worse than an install") exactly — the shipped code does not merely warn on the non-CoW path, it skips the copy attempt entirely and lets the caller (`hydrateMember()`) fall through straight to install-reconciliation.
- A missing source directory, or a `cp` invocation that exits non-zero, both return `ok: false` with an `error` string for the caller to log — `cowCopyDir()` itself never throws, and a failed/skipped copy is never fatal to the overall hydrate flow: worst case, that target falls through to a plain install for that member.

### `SessionStart` safety net, not the primary path

`haus workspace worktree add` is the correct, explicit way to create an isolated workspace worktree. A `SessionStart` hook (`hook.workspace.worktree-check`, `src/claude/merge-project-settings.ts`) runs `haus workspace worktree doctor --from-hook` as a cheap, side-effect-free, always-exit-0 check — it reports when the current workspace worktree is missing members, on the wrong branch, or unhydrated, but never auto-materializes or auto-installs anything on its own at session start (auto-hydration is opt-in only, via `worktree.autoHydrate: true`, per the plan). This keeps the hook fast and non-surprising while still catching the "I'm in a half-built worktree and don't know it" failure mode that motivated Defect A in the first place.

## Motivation (why)

- **Symlinks don't give real isolation.** The whole point of a workspace worktree is to let a feature branch's changes to a member repo (a new dependency, a schema change, a locked API contract) exist independently of the main checkout. A symlinked member repo is still the same working tree, the same index, the same branch — editing it from inside the worktree edits the main checkout too. That defeats the purpose of `git worktree add` in the first place, which is exactly what real per-member worktrees provide instead.
- **This codebase already has a documented, deliberate posture against creating symlinks in comparable paths** — `src/install/scaffold.ts`, `write-claude-files.ts`'s dry-run diff walker (ADR-0021), `backups.ts`'s restore path (ADR-0019) all refuse to create or follow symlinks. A member-repo symlink into another repo's working tree would be a new category of exception to that posture, for a feature (real isolation) that a symlink cannot actually deliver — there is no correctness or safety upside to offset that.
- **Windows symlink-permission friction** (Developer Mode or elevation required in the common case) would make `worktree add` unreliable on one of three major platforms even if isolation weren't the bigger objection.
- **The `git worktree` object-store sharing already makes the "real" approach cheap.** The plan's premise for choosing real worktrees over symlinks isn't "isolation, accept the cost" — it's "isolation, and it turns out to be nearly free," which the CoW measurement (2.9s / 5MB actual delta for 310MB of `node_modules`) demonstrates directly. Without CoW, real-worktree isolation would still be the correct choice but a much more expensive one; with it, there's no meaningful tradeoff left to weigh against symlinking.

## Alternatives considered

- **Symlink each member repo into the workspace worktree.** Rejected — doesn't provide real isolation (edits alias back to the main checkout's working tree/index), inherits Windows symlink-permission problems, and would be a new exception to this codebase's otherwise-consistent no-symlink-creation posture (see ADR-0019, ADR-0021, and the sibling ADR-0028 for a different feature that reaches the same "copy or real-materialize, don't symlink" conclusion independently).
- **Skip CoW entirely, always run a full install per worktree.** Rejected as the plan's baseline "safe but slow" fallback, not the primary design — it's still what happens when CoW is unsupported (ext4, non-Linux/non-macOS, or a copy failure), so it was never removed as an option, just demoted to the fallback path rather than the default.
- **Attempt `--reflink=auto` unconditionally on Linux/ext4 and let it silently degrade to a full copy.** Rejected per the plan's explicit instruction and confirmed in the shipped code (`cow-copy.ts`'s `detectCowStrategy()`) — filesystem type is probed first, and an unsupported filesystem skips the `cp` invocation entirely rather than eating a large, silent full copy with no indication CoW didn't happen.
- **`npm ci` instead of `npm install` for the reconciliation step.** Rejected — `npm ci` deletes `node_modules` first, which would destroy the CoW clone's benefit entirely; `install.ts` uses `npm install` specifically to preserve it (see the plan's pitfalls list).

## Consequences

- A workspace worktree is a genuinely independent, runnable checkout per member repo — branch changes, dependency changes, and uncommitted work in one worktree never leak into another or into the main checkout, matching what `git worktree` promises for tracked files and what CoW cloning extends to untracked hydration targets.
- On ext4 and any non-btrfs/xfs Linux filesystem, or any non-Linux/non-macOS platform, hydration falls back to a plain install with no CoW step — slower, but correct, and never silently mistaken for having happened (the caller can inspect `CowCopyResult.attempted`/`ok` per target).
- Disk usage from cloned `node_modules`/`vendor`/`obj`/`bin` is real and grows as files are rewritten post-clone (CoW divergence) — `haus workspace worktree remove` must actually reclaim it, which is why `remove` refuses on uncommitted/unpushed work by default (a WORKFLOW.md NEVER-rule-level guard, not a nicety) rather than silently deleting a worktree that still holds unique work.
- The `SessionStart` hook adds a per-session `haus workspace worktree doctor --from-hook` call to every haus-managed project with this hook installed — it is documented to be fast and side-effect-free, and `--from-hook` always exits 0 regardless of what it finds, so it cannot itself break a session start; it can only ever add a warning line.
- Mirrored branch names are unique per workspace-worktree slug by construction, but if a member's own main clone happens to already be checked out on that exact branch name, `git worktree add` will refuse (git disallows checking out the same branch in two worktrees simultaneously) — this surfaces as an explicit per-member error in `add`'s output rather than a silently-skipped member.
