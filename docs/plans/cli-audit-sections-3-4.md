# CLI Audit — Sections 3 & 4 Implementation Plan

**Goal:** Address the 3 findings in audit section 3 (incomplete functionality) and 3 findings in audit section 4 (could be improved/expanded) for the `haus-workflow` CLI.

**Architecture:** One feature branch, 6 independent tasks (no shared files between them except task E touching `apply.ts` alone). No ordering dependencies — listed in a sensible default order.

**Tech Stack:** TypeScript, Node test runner, existing `checkLock`/`stripHausBlock`/`getCacheManifestAge` helpers — no new dependencies.

**Reference:** [haus-workflow audit artifact](https://claude.ai/code/artifact/1abe9002-8ef0-4680-b2ab-3215aa4cf7bd), CLI sections 3 and 4.

---

### Task A (§3 item 1): Test coverage for `explain-recommendation.ts`

**Goal:** `normalizeRecommendation` and `buildRecommendationExplanation` — currently zero test references anywhere — get direct unit coverage, including the legacy-shape tolerance the audit specifically flagged as untested.

**Files:**

- Create: `tests/explain-recommendation.test.js`

**Acceptance Criteria:**

- [ ] A legacy input with a top-level `score`/`confidence`-style extra field on a recommended item is normalized without throwing, and the extra field is dropped (ignored) rather than propagated.
- [ ] A legacy item with a bare `reason` string (no `reasons` array) produces a synthesized `reasons: [{ code: 'legacy-reason', message: <reason> }]`.
- [ ] A current-shape input (already has `reasons`, `selectionMode`, etc.) round-trips unchanged in the fields it already sets.
- [ ] `buildRecommendationExplanation` maps a normalized `Recommendation` into the `selected`/`skipped`/`stats` shape correctly, including `reasonDetails` with `signal` when present.

**Verify:** `node scripts/run-tests.mjs tests/explain-recommendation.test.js` → all pass.

---

### Task B (§3 item 3): Workspace doctor — cross-repo `catalogRef` consistency

**Goal:** `haus workspace doctor` flags when configured repos are installed from different catalog refs — data it already computes per-repo via `checkLock` but never compares across repos.

**Files:**

- Modify: `src/commands/workspace/doctor.ts`
- Modify: `tests/workspace-doctor.test.js`

**Acceptance Criteria:**

- [ ] Two healthy repos with different non-null `catalogRef` values produce a new `catalog-ref-mismatch` drift item naming both refs and which repos have which.
- [ ] Repos sharing the same `catalogRef` produce no such item.
- [ ] A repo with `catalogRef: null` (never synced) is excluded from the comparison — it's "unknown," not "different."
- [ ] Existing per-repo drift kinds (`missing-from-manifest`, `version-mismatch`, etc.) are unaffected.

**Verify:** `node scripts/run-tests.mjs tests/workspace-doctor.test.js` → all pass.

**Steps:** After the per-repo loop in `runWorkspaceDoctor`, collect `{ repo: repo.name, catalogRef: lock.catalogRef }` for repos with a non-null ref. If more than one distinct ref appears, push one workspace-level `flag()` with kind `'catalog-ref-mismatch'` listing each repo→ref pairing. Add `'catalog-ref-mismatch'` to the `DriftKind` union.

---

### Task C (§3 item 2): `haus workspace undo`

**Goal:** A workspace-level teardown command — currently the only way to revert a multi-repo workspace is running `haus undo` in each member repo by hand.

**Files:**

- Modify: `src/commands/undo.ts` (parameterize `runUndo` by an optional `root`, mirroring how `setup-core.ts` was parameterized for the same reason)
- Create: `src/commands/workspace/undo.ts`
- Modify: `src/cli.ts` (register `workspace undo`)
- Create: `tests/workspace-undo.test.js`

**Acceptance Criteria:**

- [ ] `haus workspace undo --yes` runs the existing hash-gated `runUndo` logic once per configured repo (reused, not duplicated).
- [ ] It also removes the workspace-root aggregate artifacts (`workspace-summary.json`, `dependency-ownership-map.json`, `cross-repo-summary.md`, `workspace-context-map.json`) and `workspace.manifest.json` under the workspace root's `.haus-workflow/`.
- [ ] It removes the workspace `WORKSPACE.md` file outright when the collision path was used (fully haus-owned, no user content to preserve), or strips just the haus import block from workspace-root `CLAUDE.md` via the existing `stripHausBlock` when not.
- [ ] `haus.workspace.yaml` itself is left untouched — it's the user's own config, not haus-owned output.
- [ ] Requires `--yes` or an interactive confirm, matching `haus undo`'s own contract.

**Verify:** `node scripts/run-tests.mjs tests/workspace-undo.test.js tests/undo.test.js` → all pass (confirms the per-repo refactor didn't break single-repo `haus undo`).

---

### Task D (§4 item 2): Fix `urlToSlug` protocol collision

**Goal:** `http://host/path` and `https://host/path` no longer map to the same cache filename in `src/refs/fetch-refs.ts`.

**Files:**

- Modify: `src/refs/fetch-refs.ts`
- Modify: `tests/fetch-refs.test.js`

**Acceptance Criteria:**

- [ ] `urlToSlug('http://example.com/llms.txt')` !== `urlToSlug('https://example.com/llms.txt')`.
- [ ] Existing slug format for a single URL (no protocol ambiguity) is otherwise unchanged in shape (still lowercase, hyphenated, no leading/trailing hyphen) — only the collision is fixed, not the general format.

**Verify:** `node scripts/run-tests.mjs tests/fetch-refs.test.js` → all pass.

---

### Task E (§4 item 3): `haus update --check --fast` middle tier

**Goal:** A cheap check tier between `--from-hook`'s silent `readLockSummary`-only check and `--check`'s full per-file hashing — usable interactively without paying the hashing cost.

**Files:**

- Modify: `src/commands/update.ts`
- Modify: `src/cli.ts` (register the new flag)
- Modify: `tests/update-check.test.js` (or create if none exists — check first)

**Acceptance Criteria:**

- [ ] `haus update --check --fast` emits the same JSON shape as `--check` (installedCatalogRef, latestCatalogTag, catalogRefBehind, npmVersion, etc.) but with `drift: []` always and a `checkMode: 'fast'` marker, skipping all file hashing.
- [ ] `haus update --check` (no `--fast`) is unchanged — still does full hashing.
- [ ] Exit code contract for `--fast` mirrors `--check`'s "only fail on real drift" intent as closely as possible without hashing — i.e. it never sets a non-zero exit code purely from the fast path (no way to detect drift without hashing), and its output makes that limitation explicit rather than implying it checked content.

**Verify:** `node scripts/run-tests.mjs tests/update-check.test.js` (or the located file) → all pass.

---

### Task F (§4 item 1): Consistent stale-cache advisory in `apply`

**Goal:** `haus apply` (dry-run or write) surfaces a staleness warning for a non-empty-but-old catalog cache, matching the existing empty-cache warning's visibility instead of silently using old content — mirrors the same 7-day threshold `doctor` already uses.

**Files:**

- Modify: `src/commands/apply.ts`

**Acceptance Criteria:**

- [ ] When the catalog cache is present and ≥7 days old, `apply` (both `--dry-run` and `--write`) logs a warning naming the age and suggesting `haus update`, without blocking the write.
- [ ] A fresh (<7 days old) or empty cache produces no new warning (empty cache keeps its existing separate warning/error).
- [ ] No behavior change to the existing empty-cache warn/error branching.

**Verify:** `yarn test` (this touches shared cache-age logic already covered by `doctor` tests; add one targeted test in `tests/apply.test.js` for the new warning).
