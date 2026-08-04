# ADR-0017: `haus apply --prune` — opt-in deletion, hash-gated, backed up first

- **Status:** Accepted | **Date:** 2026-08-03
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/claude/write-claude-files.ts`, `src/recommender/orphaned-items.ts` (new), `src/commands/doctor.ts`, `src/commands/apply.ts`, `src/cli.ts`
- **Related:** [docs/plans/cli-audit-section-8-and-prune.md](../plans/cli-audit-section-8-and-prune.md) (Task A), [ADR-0014](0014-cli-audit-remediation-scope-and-approach.md) (decision 1, which deferred this exact feature)

## Context

`haus doctor` already advises when a lock-tracked catalog item is no longer in the current `recommendation.json` (project no longer matches its eligibility signals) without being removed from the catalog manifest — but it only advises, it never deletes. ADR-0014 explicitly deferred building the deletion side: "a future `haus apply --prune` (audit finding, not implemented here) can add opt-in deletion later." This PR builds it.

The change is small in file count (5 non-doc/test source files) but crosses this repo's own decision gate on total diff size, and — independent of the gate — genuinely embeds a policy choice worth recording: under what conditions is haus allowed to delete a file it didn't just write, and how is that made safe.

## Decision

1. **Deletion is opt-in via an explicit `--prune` flag, never automatic.** A plain `haus apply --write` still leaves orphaned-by-recommendation items in place, exactly as before this change. Silently deleting a project file the moment context-detection heuristics shift (a new dependency removed, a stack no longer detected) is the kind of surprising, hard-to-reverse action ADR-0014 already ruled out for the default path.

2. **Hash-gated, using the exact contract `cleanupStaleCatalogItems` already established** (not a new one): an item with no recorded lock hash, or whose on-disk content no longer matches the recorded hash, is left in place with a warning — never silently deleted. A user's local edits to a catalog-managed file are treated as more authoritative than the recommendation engine's opinion that the file shouldn't exist.

3. **Removed files are backed up first**, to `.haus-workflow/backups/prune-<timestamp>/`, mirroring `undo.ts`'s existing `backupManagedFilesBeforeUndo` naming convention. This is an explicit, user-requested deletion (unlike the automatic manifest-removed/deprecated cleanup, which does not back up) — the cost of one extra copy operation is worth the ability to recover from a `--prune` run that turns out to have been premature.

4. **Orphan-detection is a single shared function, not two implementations.** `src/recommender/orphaned-items.ts` exports `findOrphanedLockEntries`, used by both `doctor`'s advisory and `apply --prune`'s actual removal. The two must never disagree about which items are "orphaned" — if they silently drifted apart, `doctor` could advise on items `--prune` wouldn't touch, or vice versa.

5. **The orphaned set explicitly excludes two overlapping lifecycles it does not own**: items mid-rename via a manifest `formerIds` migration (owned by `cleanupMigratedCatalogItems`), and items removed from the manifest or marked `deprecated` (owned by `cleanupStaleCatalogItems`, which already runs immediately before this in the same function). Without this exclusion, an item in either state would also match "not in the current recommendation" and get a second, differently-worded warning from `pruneOrphanedCatalogItems` — harmless (both paths independently leave a locally-modified file in place), but confusing, and found late via adversarial code review rather than up front.

## Motivation (why)

- The three existing hash-gated removal contracts in this codebase (`cleanupStaleCatalogItems`, `undo.ts`'s `collectLockTrackedPaths`, and now `pruneOrphanedCatalogItems`) all now share the identical never-delete-a-local-edit rule. A fourth, differently-behaved deletion path would have been the kind of "similar-looking code, different actual behavior" ADR-0014 (decision 3) already flagged as a bad pattern.
- `findOrphanedLockEntries` being shared, rather than doctor and apply each re-deriving the diff, directly closes the risk CLAUDE.md names for `src/recommender/`: "a wrong gate silently drops or leaks a context asset."

## Alternatives considered

- **Make pruning automatic on every `apply --write`** — rejected for the same reason ADR-0014 rejected it for `doctor`: no confirmation step, and eligibility heuristics can shift for reasons that have nothing to do with the user's intent (a `package.json` dependency bump, a detection-confidence change).
- **Skip the backup step, since the hash gate already prevents deleting modified files** — rejected; the hash gate protects against deleting _edited_ files, not against a user deciding after the fact that a prune was premature even for an unmodified file (e.g. the recommendation engine's read of the project was wrong, or they want the item back regardless).
- **Let `pruneOrphanedCatalogItems` also warn on migration/deprecated overlaps rather than exclude them** — rejected once found in review; two warnings about the same file from two different code paths is worse than one, and correctly excluding them costs three set-membership checks against data (`allMigrations`, `manifestById`) already computed earlier in `writeClaudeFiles`.

## Consequences

- `doctor`'s orphan advisory and `apply --prune`'s removal are now guaranteed to agree on what counts as orphaned, by construction (same function, same inputs computed the same way in both call sites) — not by convention alone.
- `doctor`'s advisory (and, by extension, `--prune`) does **not** currently account for former-id migrations when computing "orphaned" — a mid-migration item that's locally modified will still be excluded from deletion (protected by `cleanupMigratedCatalogItems`'s own hash check first), but `doctor`'s advisory text can describe it as "no longer recommended" when it's more accurately "renamed and locally modified." Not fixed here (`doctor.ts` doesn't currently load manifest/migration data at all); tracked as a known gap, not a safety issue, since nothing is deleted incorrectly either way.
- `.haus-workflow/backups/` now has a third naming scheme (`prune-<timestamp>/`, alongside `undo-<timestamp>/` and `haus.lock.<timestamp>.json`) with nothing yet to list, restore, or prune old backups themselves — that's a separate, already-planned task (Task C, `haus backups`, in the linked plan doc).
