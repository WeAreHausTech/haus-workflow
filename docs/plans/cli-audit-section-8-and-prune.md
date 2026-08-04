# CLI Audit — Section 8 (Missing Entirely) & Section 9 Item 4 Implementation Plan

**Goal:** Address the 5 findings in audit section 8 ("missing entirely") and finish audit section 9 item 4 ("partially addressed" — `doctor` advisory exists, `--prune` itself does not) for the `haus-workflow` CLI.

**Architecture:** One feature branch per task recommended (these are larger and more independent than the section 3/4 remediation was — several touch the same files as each other, e.g. Task A and Task B both touch `write-claude-files.ts`, and Task A reuses logic Task's own refactor extracts from `doctor.ts`). Suggested order below is risk-ascending: finish an already-half-built feature first, end with the one item that needs a design decision before any code is written.

**Tech Stack:** TypeScript, Node test runner, existing `createUnifiedDiff`/`hasTextChanged`/`summarizeDiff` (`src/utils/diff.ts`), existing hash-gated removal pattern (`cleanupStaleCatalogItems`, `undo.ts`'s `collectLockTrackedPaths`) — no new dependencies expected for Tasks A–D. Task F (per-item catalog ref pinning) may require a new persisted file (`pins.json` or a lock schema addition) — to be decided by its ADR, not this plan.

**Reference:** [haus-workflow audit artifact](https://claude.ai/code/artifact/1abe9002-8ef0-4680-b2ab-3215aa4cf7bd), CLI section 8 (all 5 items) and section 9 item 4. Builds on the advisory added in [PR #179](https://github.com/WeAreHausTech/haus-workflow/pull/179) / [ADR-0014](../decisions/0014-cli-audit-remediation-scope-and-approach.md).

---

### Task A (§9 item 4, finishing it): `haus apply --prune`

**Goal:** Actually remove catalog items that fell out of eligibility without being removed from the manifest — today `doctor` only advises ("review whether they are still needed"), it never deletes. Give the advisory teeth, using the same hash-gated safety pattern already proven twice in this codebase.

**Files:**

- Create: `src/recommender/orphaned-items.ts` — extract the orphan-detection diff (lock-tracked ids not in current `recommendation.recommended`) out of `src/commands/doctor.ts:254-271` into a shared, testable function. `doctor` calls it for its advisory; `apply --prune` calls it to decide what to remove.
- Modify: `src/commands/doctor.ts` — replace the inline diff at lines 254-271 with a call to the new shared function. No behavior change to the advisory itself.
- Modify: `src/commands/apply.ts` — add `--prune` flag.
- Modify: `src/claude/write-claude-files.ts` — add a `pruneOrphanedItems` function mirroring `cleanupStaleCatalogItems` (lines 526-573) and `undo.ts`'s `collectLockTrackedPaths` (lines 37-70) hash-gate: for each orphaned id, skip with a warning if `entry.hash` is undefined or `hashInstalledPaths` doesn't match (user-modified — never silently delete a local edit); otherwise back up (mirroring `backupManagedFilesBeforeUndo`'s naming under `.haus-workflow/backups/prune-<timestamp>/`), remove the files, prune empty dirs, and drop the lock entry.
- Create: `tests/apply-prune.test.js`

**Acceptance Criteria:**

- [ ] `haus apply --prune` (requires `recommendation.json` to exist — same precondition as the `doctor` advisory) identifies the same orphaned-id set `doctor`'s advisory already reports, via the new shared `orphaned-items.ts` function (not a second re-implementation of the diff).
- [ ] An orphaned item whose on-disk hash matches `haus.lock.json`'s recorded hash is removed: its files deleted, empty parent dirs pruned, its lock entry dropped.
- [ ] An orphaned item that's been locally modified (hash mismatch) or has no recorded hash is **not** deleted — a warning names it and explains why it was left in place.
- [ ] Before any deletion, removed files are backed up under `.haus-workflow/backups/prune-<timestamp>/`, following the existing undo-snapshot naming convention.
- [ ] `haus apply --prune --dry-run` reports what would be pruned (and why anything would be skipped) without touching disk or the lockfile.
- [ ] `haus.lock.json` no longer lists a pruned item's entry after a real (non-dry-run) prune.
- [ ] `doctor`'s existing advisory output is unchanged after the extraction refactor (same message, same conditions).

**Verify:** `node scripts/run-tests.mjs tests/apply-prune.test.js tests/doctor-orphaned-items.test.js` → all pass (the second file confirms the extraction didn't change `doctor`'s existing behavior).

---

### Task B (§8 item 1): Real unified diff for catalog-item content in dry-run

**Goal:** `haus apply --dry-run` currently prints only `"<path>: would overwrite (<item-id>)"` or `"would create"` for catalog items (`src/claude/write-claude-files.ts:330-334`) — no content comparison happens at all. `WORKFLOW.md` and `settings.json` already get real unified diffs in dry-run via `writeManagedText` (`src/claude/managed-write.ts`) and `writeWorkflow` (`src/claude/write-workflow.ts:105-115`). Bring catalog items to the same standard, reusing the same diff primitives (`createUnifiedDiff`/`summarizeDiff`, `src/utils/diff.ts`).

**Files:**

- Modify: `src/claude/write-claude-files.ts` (dry-run branch around lines 330-334, and the per-file content read already happening at line 366 for the non-dry-run path)
- Modify: `tests/apply.test.js` (or `tests/diff-generated-files.test.js` if that's the more direct home — check both before choosing)

**Acceptance Criteria:**

- [ ] A catalog item whose destination file exists and differs from the source content logs a real unified diff in `--dry-run`, using the same `createUnifiedDiff`/`summarizeDiff` helpers `writeManagedText` already uses.
- [ ] A brand-new item (destination doesn't exist) still clearly reports "would create" — decide during implementation whether it also shows a diff-from-empty (matching `writeManagedText`'s `!prev` branch) for consistency, and pin that decision down in the test.
- [ ] An unchanged existing item reports something like `"<path>: unchanged"` instead of unconditionally saying "would overwrite" regardless of actual content difference.
- [ ] Skill items (directories, multiple files) get a per-file diff loop — one diff per changed file inside the skill, not one diff for the whole directory tree.
- [ ] The non-dry-run write path is completely unchanged — this task only touches the dry-run branch.

**Verify:** `node scripts/run-tests.mjs tests/apply.test.js` → all pass. Manual check: locally edit a file inside an already-installed skill, run `yarn dev apply --dry-run`, confirm the diff shows the actual local edit instead of a bare "would overwrite".

---

### Task C (§8 item 2): `haus backups` — list, restore, prune

**Goal:** `.haus-workflow/backups/` already accumulates two kinds of snapshot (lock backups from `applyLock`, `src/update/lockfile.ts:98-100`; per-file undo backups from `backupManagedFilesBeforeUndo`, `src/commands/undo.ts:135-150`) with nothing anywhere to list, restore, or prune them. They grow unbounded.

**Files:**

- Create: `src/commands/backups.ts` (or a `src/commands/backups/{list,restore,prune}.ts` split if it grows past the workspace-subcommand size — follow whichever existing pattern `src/commands/workspace/` used)
- Modify: `src/cli.ts` — register `haus backups list`, `haus backups restore <id>`, `haus backups prune`
- Create: `tests/backups.test.js`

**Acceptance Criteria:**

- [x] `haus backups list` enumerates `.haus-workflow/backups/`, distinguishing the two existing naming schemes (`haus.lock.<timestamp>.json` lock-snapshots vs. `undo-<iso-timestamp>/<relative-path>` per-file snapshots), printing an id, its kind, and its age. (Also distinguishes `prune-<iso-timestamp>/` as its own kind, a third scheme this task found already in use.)
- [x] `haus backups restore <id>` for a lock-snapshot overwrites the current `haus.lock.json` with that snapshot's content, after an interactive confirm (or `--yes`), warning if the current lock is newer than the one being restored.
- [x] `haus backups restore <id>` for an undo-snapshot copies the backed-up files back to their original relative paths, after confirm (or `--yes`). (Same restore path also handles `prune-` snapshots.)
- [x] `haus backups prune [--older-than <days>] [--keep <n>]` deletes backup entries past the age threshold or beyond the keep-count (oldest first), printing what was removed and what was kept. (Refuses to run with neither flag given, rather than defaulting to an unbounded wipe.)
- [x] Restoring never silently overwrites something newer without a warning naming both timestamps.

**Verify:** `node scripts/run-tests.mjs tests/backups.test.js` → all pass.

---

### Task D (§8 item 5): Aggregated CI-gate command

**Goal:** `doctor`, `decisions check`, and `update --check` each independently set `process.exitCode` with no single documented contract a CI pipeline can rely on in one call. Give them one aggregate entry point.

**Files:**

- Create: `src/commands/ci-gate.ts` (command name: `haus ci-gate` — avoids ambiguity with `update --check`'s existing `--check`/`--fast` flags)
- Modify: `src/cli.ts` — register `haus ci-gate`
- Create: `tests/ci-gate.test.js`
- Docs: update whichever CLI reference doc lists commands (route via `docs/SUMMARY.md`; run the **writing-documentation** skill after implementation, per this repo's own CLAUDE.md rule)

**Acceptance Criteria:**

- [x] `haus ci-gate` invokes `runDoctor()`, `runDecisions({ mode: 'check' })`, and `runUpdate({ check: true, fast: true })` — fast tier, not full-hash, since a full-hash pass on every CI run is expensive; this tradeoff is documented in the command's own `--help` text — and captures each one's own pass/fail into a local result instead of letting each set `process.exitCode` independently mid-run.
- [x] Prints one aggregated human-readable summary (per-check pass/fail) and sets `process.exitCode = 1` if any constituent check failed, `0` otherwise.
- [x] `--json` emits one machine-readable object `{ doctor: {...}, decisions: {...}, update: {...}, ok: boolean }`.
- [x] `haus doctor`, `haus decisions check`, and `haus update --check` remain independently runnable, with their own existing exit-code contracts completely unchanged.

**Verify:** `node scripts/run-tests.mjs tests/ci-gate.test.js` → all pass. Manual check: in a repo with a known `doctor` `flag()`-level finding, run `haus ci-gate` and confirm non-zero exit with that finding named in the summary.

---

### Task E (§8 item 4): Near-miss reporting in recommendations

**Goal:** Today an item either qualifies or it doesn't — the eligibility loop in `src/recommender/recommend.ts` (gates from roughly line 91 to 230: `former-id`, `invalid-source`, `unsupported-policy`, `deprecated`, curated/risk gates, `sensitive-policy`, `source-trust`/`source-approval`, role checks, `requiresAny`) is a sequential gate list that early-exits (`continue`) on the first failing gate — so there is no "missing just one signal" diagnostic; a per-signal breakdown across _all_ gates doesn't exist and can't be reconstructed after the fact.

**⚠️ Highest-stakes:** `workflow-config.md` names `src/recommender/` (binary eligibility + policy gates) as highest-stakes — "a wrong gate silently drops or leaks a context asset." This task **requires TDD**: write the near-miss test cases first, confirm they fail, then implement. The eligibility _outcome_ (which items get recommended vs. skipped) must be provably identical before and after this change.

**Files:**

- Modify: `src/recommender/recommend.ts` — restructure the gate loop to evaluate every gate per item (accumulating `{ name, passed }[]`) before deciding skip/recommend, instead of stopping at the first failure. Keep the existing first-failure `skipReasons` output as-is for backward compatibility; add the full per-gate breakdown additively.
- Modify: `src/recommender/explain-recommendation.ts` — surface a near-miss section: items failing exactly one gate, separated from items failing two or more, naming the single missing signal for the former.
- Modify: `tests/recommend-eligibility.test.js`, `tests/recommend-gate-regression.test.js`, `tests/explain-recommendation.test.js`

**Acceptance Criteria:**

- [ ] Every gate is evaluated for every item (no early `continue`), producing a `gates: { name: string, passed: boolean }[]` array per item.
- [ ] `recommendation.json`'s schema gains this additively (new optional field) — no existing consumer breaks.
- [ ] `explain-recommendation`'s output includes a near-miss list: items one gate away from qualifying, each naming that one missing signal.
- [ ] **Zero eligibility-outcome diffs**: for the full existing fixture set, which items are recommended vs. skipped is identical before and after this change — verified by running the existing eligibility/gate-regression suites unmodified in their pass/fail assertions.
- [ ] Test cases for near-miss detection are written and confirmed failing _before_ the loop restructure lands (TDD requirement above).

**Verify:** `node scripts/run-tests.mjs tests/recommend-eligibility.test.js tests/recommend-gate-regression.test.js tests/explain-recommendation.test.js` → all pass, with no change to any existing test's expected recommend/skip outcome.

---

### Task F (§8 item 3): Per-item catalog version pinning — **blocked on an ADR, do not start implementation without one**

**Goal (design question, not yet a build task):** Let one catalog item stay pinned to an older catalog ref while the rest of the project tracks latest. Per `WORKFLOW.md`: "if you would otherwise make an assumption: write an ADR instead" — this is exactly that case.

**Why this one is different from A–E:** current ref resolution (`resolveCatalogRef`, `src/catalog/remote-catalog/ref.ts:133-176`) is a single global, per-process value, cached module-globally. The lock already has a per-item `catalogRef` field (`src/update/lockfile.ts:22`), but it's only ever a passive record of what ref an item happened to sync from last, via `lockCatalogRef` (`write-claude-files.ts:428-431`) — nothing today lets a user _declare_ "keep this one pinned." Making a pin actually take effect means the content-fetch path (`loadCatalogContext`, which implies one shared `contentRoot` for all items) would need to fetch and cache content per-ref, not just record metadata — a change to the sync architecture, not a small patch.

**Before any code:** write `docs/decisions/NNNN-per-item-catalog-ref-pinning.md` deciding:

1. Where a pin is declared (a new `pins.json`? A field on the existing lock entry that `apply`/`update` read back and respect?) and who can set it (CLI flag on `apply`/`update`, or hand-edited config?).
2. Whether pinned-item content is fetched from a per-ref cache dir (`cache/<ref>/...`) instead of the single shared cache dir `readWorkflowTemplate`/`syncOneItem` currently write to — and what that does to cache size/growth over time as more refs accumulate.
3. How `haus update`'s drift/behind reporting (`catalogRefBehind`) should represent "N items pinned behind, on purpose" vs. today's single global comparison — so a pin doesn't just look like unnoticed staleness.
4. Interaction with `haus doctor`'s tamper/staleness checks — a pinned item must not trip the same "stale cache" warning `apply`/`doctor` show for an accidentally-old global cache.

Once that ADR is accepted, this task gets its own plan file with acceptance criteria — it's deliberately not specified further here.

---

## Suggested order

A → B → C → D → E → (F: ADR first, separate plan after).

A and B both touch `write-claude-files.ts` — land A first (smaller, more contained diff) so B's diff-logging change applies to a settled file. C and D are fully independent of A/B/E and of each other — can run in parallel on separate branches if picked up by different people/sessions. E is the highest-risk item in this batch (highest-stakes file, requires TDD) — do it last among the "ready to build" tasks so any process/test lessons from A–D are already fresh.
