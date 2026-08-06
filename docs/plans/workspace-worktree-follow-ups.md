# Workspace worktree + detection fixes — follow-ups

**Status:** open. **Source:** work completed in [PR #197](https://github.com/WeAreHausTech/haus-workflow/pull/197) (merged) executing [workspace-worktree-materialization.md](workspace-worktree-materialization.md) and [workspace-detection-and-permissions-fixes.md](workspace-detection-and-permissions-fixes.md) in full, plus 14 Copilot review passes on that PR. ADRs 0025–0029 accepted. This doc is the leftover list — nothing here blocks what already shipped; each item is independently pickup-able.

## 1. Real vafab-workspace validation (highest priority)

Both source plans name `vafab-workspace` (5 members, two package managers — Yarn 4 and .NET — split across Azure DevOps and GitHub, one hard sibling dependency, an already-poisoned `context-map.json`) as **the** reference environment for verification. Everything in PR #197 — `resolveRoots()`, `readMembers()`, `haus workspace worktree add/hydrate/list/remove/doctor`, `haus workspace link-context`, the untracking migration — was tested against synthetic fixtures only. None of it has run against the real environment the plans were written to fix.

**Do:** once a new `haus` release ships this work (see #4), run against vafab-workspace directly:

```bash
haus update                                    # pull the new release
haus doctor                                    # confirm apply --write's untracking migration runs clean on the poisoned context-map.json
haus workspace worktree add validation-slug
cd .claude/worktrees/validation-slug
ls                                             # all 5 members visible?
cd vafab-forms && yarn build                   # CoW hydration + install worked?
cd ../vafab-forms-admin && node -e "require('../vafab-forms/src')"  # sibling resolution still works?
cd ../.. && haus workspace worktree remove validation-slug
haus workspace link-context --write            # cross-repo skill visibility
```

Do not run destructive tests directly there without confirming with whoever owns vafab-workspace first (per the original plan's own stop condition).

**Acceptance:** every acceptance criterion in both source plans, re-verified against the real environment, not just the synthetic fixtures already in `tests/`.

## 2. `setup-answers.json` — still unresolved

ADR-0025 explicitly left this out of the untracking migration: zero references anywhere in `src/`/`library/` at the time, so no code change was made for it (avoided guessing at a schema for a file this codebase has no relationship to).

**Do:** confirm directly against a real affected workspace (or whoever filed the original ticket) whether this file still gets written by anything in practice, and by what. If it's real:

- Add it to `src/claude/write-gitignore.ts`'s gitignore-writer pattern list.
- Add it to `apply --write`'s untracking migration.
- Write a follow-up ADR noting it supersedes ADR-0025's explicit exclusion.

If it's confirmed dead (no writer anywhere, a leftover from a haus version predating this codebase), close this out with a one-line note in ADR-0025 instead — don't leave it as a silent open question forever.

## 3. `worktree.autoHydrate` config opt-in — never built

The SessionStart safety-net hook (`hook.workspace.worktree-check`) ships report-only, per the plan's own instruction not to build the opt-in gate mechanism just for this one fragment. The config field it's documented to check (`worktree.autoHydrate: true`) doesn't exist anywhere in `WorkspaceConfig`/`parseWorkspaceConfig` (`src/commands/workspace/config.ts`).

**Do, if wanted:** add `autoHydrate?: boolean` under a `worktree:` key in `haus.workspace.yaml`'s schema (parser + renderer, per the round-trip rule — see `readMembers()`'s own ADR-0026 note on this), then have the hook's `--from-hook` path call `haus workspace worktree hydrate` when the flag is set and a member is unhydrated. Keep it opt-in only — a session start must never silently spend minutes on installs uninvited, per the original plan.

## 4. Release not yet cut

Per the PR's own commit history, `CHANGELOG.md`/`package.json`'s version were deliberately left to this repo's `release-it` + conventional-changelog automation rather than hand-edited. Every commit in PR #197 already uses `feat:`/`fix:`/`test:`/`docs:` prefixes, so `yarn release` (see `package.json` scripts) will compute a minor bump (1.5.0) on its own.

**Do:** run `yarn release` (or `yarn release:dry` first to preview) whenever ready to ship this to `haus`'s actual users. Nothing else in this list is blocked on it, but #1 (vafab-workspace validation) needs it published first since that's a real user's machine, not this dev checkout.

## 5. Catalog-side: closed

The `writing-documentation` skill's `deep-context.json` instructions were fixed in [haus-workflow-catalog PR #68](https://github.com/WeAreHausTech/haus-workflow-catalog/pull/68) (merged) — no longer listed as open here, kept for cross-reference only.

## Out of scope (already decided, don't re-litigate)

- The 3-file config trap (`haus.workspace.yaml` / `repos.manifest.json` / `repos.local.json`) stays as a documented known wart — ADR-0026 explicitly deferred consolidation, no urgency.
- Symlinking for cross-repo skill/agent/command visibility — ADR-0028 chose copy-with-provenance; the git-boundary premise that originally motivated investigating this was disproven by the 3.4a spike (see ADR-0028's Context section for the corrected framing), but copy is still the right call for the other reasons that ADR gives independently.
