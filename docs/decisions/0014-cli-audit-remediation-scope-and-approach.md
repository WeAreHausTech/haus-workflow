# ADR-0014: CLI audit remediation — scope, deletion policy, and module split approach

- **Status:** Accepted | **Date:** 2026-08-03
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/catalog/remote-catalog.ts` (split), `src/install/settings-merge.ts`, `src/commands/undo.ts`, `src/commands/doctor.ts`, `src/commands/setup-core.ts` (moved), `src/recommender/git-signal.ts`, `src/security/guard-bash.ts`, `src/update/hash-installed.ts`, `src/scanner/read-context.ts`, `src/claude/write-claude-files.ts`
- **Related:** [docs/plans/cli-audit-remediation.md](../plans/cli-audit-remediation.md)

## Context

A source-level audit of this repo (conversation-scoped, not a filed issue) found 2 confirmed bugs, 8 possible-bug risks, 3 refactor targets, and 4 DRY duplications in the `haus-workflow` CLI. This PR fixes all of them in one branch (19 commits). The change touches 12 source files and is large enough (`minFilesChanged`/`minLinesChanged` in `library/catalog/decisions-triggers.json`) to trip this repo's own decision gate — not because any single fix is architecturally risky, but because three of the fixes involved a real judgment call that should be on record rather than left implicit in a commit message.

## Decision

1. **L4 (items that fall out of eligibility) is mitigated with an advisory, not deletion.** `doctor` now flags a lock-tracked item that's no longer in the current `recommendation.json` as a suggestion — it does not delete the file. Automatically deleting a project file the moment context-detection heuristics change is a destructive, hard-to-reverse action with no confirmation step; a human should decide whether to actually remove it. A future `haus apply --prune` (audit finding, not implemented here) can add opt-in deletion later.

2. **R2 (`remote-catalog.ts` split) uses a barrel re-export, not a public API change.** The 781-line file split into `remote-catalog/{ref,http,github-tree,manifest,workflow-template,sync}.ts` by concern, with `remote-catalog.ts` reduced to `export { ... } from './remote-catalog/*.js'` statements. Every name it exported before the split is still importable from the same path with an identical signature — chosen specifically so no other file in the codebase needed to change its imports, keeping this a pure structural move with zero behavior risk on the file CLAUDE.md calls highest-stakes.

3. **DRY on `settings-merge.ts`'s deny/allow/ask functions uses a factory, not a shared base + overrides.** `createRuleTier(permKey, trackedKey)` returns a `{ merge, strip }` pair; the six previously-duplicated exported functions became one-line delegations to three tier instances. `stripHausHooks` (the eighth, superficially similar function) was deliberately left out of the factory — it deletes the whole `_haus` namespace rather than reconciling one tier, and forcing it into the same shape would have been "similar-looking code, different actual behavior."

4. **`undo`'s hash-gating (L5) mirrors `cleanupStaleCatalogItems`'s existing contract exactly**, rather than inventing a new one: a lock-tracked file with no recorded hash is still removed unconditionally (matches pre-hash-tracking entries), and one with a hash mismatch is preserved with a log line naming the item. Core managed files (settings.json, rules/haus.md, WORKFLOW.md, etc.) are unaffected — only lock-tracked catalog item files gained the check.

## Motivation (why)

- Every fix ships with a regression or characterization test, and refactors were verified against existing test suites before/after (not new tests) to prove behavior-preservation.
- The full suite (680 tests) was run twice consecutively after the riskiest change (the module split) specifically to catch module-level-state ordering bugs the split could introduce — none found.
- One additional bug was found and fixed during this work, outside the original audit list: the L7 git-signal fix's three parallel git subprocess calls shared one `try/catch`, so a timeout on any single call (observed under the full test suite's own concurrent git-subprocess load) silently dropped the other two calls' results. Each call is now independently fault-isolated.

## Alternatives considered

- **Leave L4 unmitigated until a full `--prune` command exists** — rejected; a silent, undetectable accumulation of stale files is worse than a visible advisory with no auto-fix yet.
- **Split `remote-catalog.ts` by introducing new export names** (e.g. `RefResolver` class) — rejected; would have required updating every importer for no behavioral benefit, and CLAUDE.md flags this file as highest-stakes specifically because it's the supply-chain trust boundary — minimizing surface-area change was the priority.
- **One shared base class for all three settings-merge tiers, with hook methods** — rejected in favor of the plainer closure-returning factory; a class hierarchy would have been more machinery than three near-identical functions warranted.

## Consequences

- `src/catalog/remote-catalog.ts` is now a 24-line barrel; the actual implementation lives under `src/catalog/remote-catalog/`. Anyone adding a new export to this area should add it to the right submodule and re-export it from the barrel, not add it back to the top-level file.
- `doctor`'s new "installed item no longer recommended" advisory can surface on any project immediately after a context/stack change, even with no code change on haus's side — this is expected, not a bug, per decision 1 above.
- `setup-core.ts` now lives at `src/claude/setup-core.ts`; `init.ts → setup-project.ts` remains a command-to-command import (deliberately out of scope — see the plan doc's note on why that link wasn't touched).
