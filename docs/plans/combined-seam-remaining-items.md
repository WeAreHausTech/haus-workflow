# Combined/seam remaining items — Implementation Plan

**Goal:** Close the four items still open in the audit's Combined/seam section (§B, §D3, §E1, §E2, §E3 — E1/E2/E3 counted as one initiative each, B/D3 are the same item) after the catalog-repo-only remediation passes closed everything in `haus-workflow-catalog`'s own CLI and catalog sections. All four live entirely in **this repo** (`haus-workflow`, the CLI) — the catalog repo has nothing further to do for these.

**Source doc:** [haus Audit — CLI, Catalog & Combined Workflow](https://claude.ai/code/artifact/1abe9002-8ef0-4680-b2ab-3215aa4cf7bd), Combined section (§B "Where the two validators can diverge", §D item 3, §E items 1–3).

**State verified:** 2026-08-05, against this repo's `main` @ `0031f7d` and `haus-workflow-catalog`'s `main` @ `ec203da` (both checked out locally, side by side under `~/Git/Haus/`).

**Prior art already in place — do not duplicate:**

- ADR-0005 (`docs/decisions/0005-cross-repo-contract-testing.md`, Accepted 2026-06-04) already ships `scripts/contract-check.mjs` + `tests/contract-invariants.test.js` + `.github/workflows/contract-drift.yml`. That covers **schema/data drift** (validation-rules.json byte match, fixture key-set vs. live schema, lock-schema shape). It does **not** run both validators' actual pass/fail logic against the same items, which is exactly what §B/D3 still flags as open ("doesn't check that the two sides agree on what passes or fails"). Task 4 below is additive to ADR-0005, not a replacement.
- Both repos' fixtures are confirmed in sync right now (`manifest.json` version `4.1.0` on both sides) — a good, clean baseline to pin a new contract test against.

## Remaining open items, mapped to audit sections

| #   | Audit ref | Item                                                                                              |
| --- | --------- | --------------------------------------------------------------------------------------------------- |
| 1   | §E3       | `sourceInfluences?` still in the CLI's hand-maintained `CatalogItem` type, though ADR-0019 removed it catalog-side |
| 2   | §E2       | `auditSafetyNotes` / `auditIntents` / `auditDiskOrphans` exist only in the catalog repo's `validate-core.mjs` — the CLI's own `validate-core.ts` has no equivalent |
| 3   | §E1       | `safetyNotesRequiredTags` / `intentsRequiredTags` rule *data* synced into `library/catalog/validation-rules.json`, but `validate-core.ts` never reads or enforces either key |
| 4   | §B / §D3  | No test asserts the two validator *implementations* agree on verdicts for the same items — only that their data/schema shapes match (ADR-0005) |

## Execution order

Ordered so each step's output de-risks the next: trivial type cleanup first, then the two enforcement mirrors (each independently testable), then the cross-validator parity test last — so it locks in a genuinely green baseline instead of landing red on day one and needing a big fixup.

### Task 1 — Remove `sourceInfluences?` from `CatalogItem`

**Do:** Delete the `sourceInfluences?: Array<{ source: string; idea: string }>` field from the `CatalogItem` interface (`src/types.ts:75`) and its entry in the known-fields list (`src/types.ts:125`). Grep the rest of `src/` and `tests/` for any remaining reference (recommender, write-claude-files, fixtures) and remove those too.

**Acceptance criteria:**

- Zero occurrences of `sourceInfluences` anywhere under `src/` after the change.
- `tsc --noEmit` clean (catches any consumer that still destructures the field).
- No behavior change — nothing in the CLI ever read this field for a decision, only carried the type.

**Verification:** `yarn typecheck`, `yarn test`, `yarn build` all green.

**Dependencies:** none. **Risk:** none — type-only removal of a field with zero real consumers, matching ADR-0019 catalog-side.

**Reference:** §E3, ADR-0019 (catalog repo).

---

### Task 2 — Mirror `auditSafetyNotes`, `auditIntents`, `auditDiskOrphans` into `validate-core.ts`

**Do:** Port the three catalog-side audits (`haus-workflow-catalog/scripts/validate-core.mjs:144-165`, `:439-456`) into `src/catalog/validate-core.ts`, following the file's existing pattern (`auditForbiddenStacks`, `auditOptInMetadata` — plain `(items) => string[]` functions wired into `validateCatalogData`'s failures array).

- `auditSafetyNotes` / `auditIntents`: gate on `safetyNotesRequiredTags` / `intentsRequiredTags` (see Task 3 — these need to be readable from `validation-rules.ts` first, so land Task 3's rule-export plumbing as a shared prerequisite commit, or do Tasks 2+3 as one PR).
- `auditDiskOrphans`: needs a `CONTENT_ROOTS` constant (`skills/`, `agents/`, `templates/`, `commands/`, `configs/`) and a path-claimed helper — port `isPathClaimed`/`walkAllFiles` from the catalog repo's script. Confirm whether the CLI needs its own `DISK_ORPHAN_EXEMPT_PREFIXES` equivalent (catalog repo has one exemption — check if it applies when `manifestDir` is the CLI's own `tests/fixtures/catalog/` vs. a full checkout of `haus-workflow-catalog` passed to `haus validate-catalog`).

**Acceptance criteria:**

- All three audits run inside `validateCatalogData()`, same call site every other audit uses (`src/catalog/validate-core.ts:320` area).
- `haus validate-catalog <path-to-haus-workflow-catalog-checkout>` now fails on a manifest missing `safetyNotes`/`intents` for a tagged auth/payments item, or a disk-orphaned file — matching what `yarn validate` already catches catalog-side.
- Running it against the current `haus-workflow-catalog` checkout passes clean (both repos are in sync today).
- New unit tests for each audit function (good case, each failure case) in whichever `tests/*.test.js` file holds `validate-core.ts` coverage today.

**Verification:** `yarn test`, plus a manual run of `haus validate-catalog ~/Git/Haus/haus-workflow-catalog/manifest.json` (or equivalent CLI invocation) against the real sibling checkout, confirming a clean pass.

**Dependencies:** shares rule-export plumbing with Task 3 — land together or Task 3 first. **Risk:** medium — this is the CLI's real ingest-time validator, used by real `haus apply`/`haus validate-catalog` runs; a wrong gate could reject or silently pass real installs.

**Reference:** §E2.

---

### Task 3 — Land `safetyNotesRequiredTags` / `intentsRequiredTags` enforcement

**Do:** `library/catalog/validation-rules.json` already carries both keys (synced). `src/catalog/validation-rules.ts` (the thin loader) needs to re-export them, same pattern as `FORBIDDEN_TAGS`/`REQUIRED_SKILL_FRONTMATTER`:

```ts
export const SAFETY_NOTES_REQUIRED_TAGS: readonly string[] = rules.safetyNotesRequiredTags
export const INTENTS_REQUIRED_TAGS: readonly string[] = rules.intentsRequiredTags
```

Then wire them into the two audit functions from Task 2.

**Acceptance criteria:**

- `validation-rules.ts` exports both constants; `validate-core.ts`'s `auditSafetyNotes`/`auditIntents` consume them (case-insensitive tag match, same as catalog-side `SAFETY_NOTES_REQUIRED_SET`/`INTENTS_REQUIRED_SET`).
- A synthetic fixture item tagged `stripe`/`bankid`/etc. with empty `safetyNotes` or `intents` fails validation; the same item populated passes.
- This repo's own convention (`docs/security.md`, referenced in the audit) — "rule changes land in the CLI validator + fixture before the catalog repo" — is satisfied retroactively: the catalog repo already required this at `yarn validate` time; this task is what makes the CLI's own `validate-core.ts` agree.

**Verification:** `yarn test` new cases green; `yarn typecheck`.

**Dependencies:** prerequisite for Task 2's `auditSafetyNotes`/`auditIntents`; do first or same PR. **Risk:** low-medium — same ingest-time-validator risk class as Task 2, but additive (only tightens auth/payments items, and only 3 real items are affected today per the catalog repo's own audit fix).

**Reference:** §E1.

---

### Task 4 — Cross-repo validator behavioral-parity test

**Do:** Add a new check (script + test, e.g. `scripts/contract-behavior-check.mjs` + `tests/contract-behavior.test.js`, alongside the existing ADR-0005 `contract-check.mjs`/`contract-invariants.test.js`) that:

1. Builds or reuses a small set of shared golden fixture items — some well-formed, one per known failure category (missing required field, forbidden tag, missing `safetyNotes`/`intents` on a tagged item, disk-orphaned file, bad `installMode`, malformed `optInTier` pairing, etc.).
2. Runs that fixture set through `haus-workflow-catalog`'s `validateCatalog()` (`scripts/validate-core.mjs`) and through this repo's `validateCatalogData()` (`src/catalog/validate-core.ts`).
3. Asserts both return the **same verdict** (pass/fail) and, where practical, matching failure categories per item — not byte-identical message text, since wording differs between the two hand-written implementations.

Two sourcing options for the golden fixtures — pick one and document the choice in an ADR (per this repo's own "write an ADR instead of assuming" rule, since this is exactly the kind of contract-shape decision that rule calls out):

- **(a)** Live: the test requires `haus-workflow-catalog` checked out as a sibling directory (matches this session's actual setup) and shells out to its `validate-core.mjs` directly.
- **(b)** Vendored: commit a small, frozen fixture set into this repo (e.g. `tests/fixtures/contract-behavior/`) plus a pinned copy of just the catalog's pure audit functions (or import them if `validate-core.mjs` becomes a published/shared package some day) — decouples this repo's CI from the sibling checkout existing.

Recommend **(a)** for now (both repos are already siblings in every dev/CI context that matters — this repo's own CI could check out the catalog repo as a second checkout step) since it tests the *real* current logic on both sides rather than a frozen copy that itself drifts; note in the ADR that (b) is the fallback if sibling-checkout CI proves too fragile.

**Acceptance criteria:**

- New check passes today (both validators currently agree on the shared fixture set — confirms the "clean baseline" assumption from Tasks 1–3).
- Injecting a deliberate one-sided bug (e.g. temporarily loosen one validator's tag check) makes the new check fail — proves it actually catches divergence, not just schema drift (ADR-0005's existing coverage).
- Wired into CI following the same strictness model as ADR-0005 (WARN on PR if sibling checkout unavailable, FAIL on main push / scheduled cron where CI can guarantee both checkouts).
- New ADR recorded (`docs/decisions/0024-cross-repo-validator-behavior-parity.md`) documenting the (a) vs (b) fixture-sourcing decision.

**Verification:** `yarn test` green with the new check; manually break one validator's logic locally and confirm the check goes red; `yarn test` full suite unaffected otherwise.

**Dependencies:** Tasks 1–3 must land first — otherwise this test starts red on `auditSafetyNotes`/`auditIntents`/`auditDiskOrphans` divergence that Tasks 2–3 are what actually fixes, and the "clean baseline" acceptance criterion can't be met.

**Risk:** medium — the highest-value item (closes the audit's specifically-named remaining validator-parity gap) but also the newest infra (a second cross-repo check alongside ADR-0005's), and touches CI config (`.github/workflows/`). Do in a dedicated worktree; write the ADR before the code per this repo's own convention.

**Reference:** §B, §D item 3.

---

## Explicitly out of scope

- Anything already closed by the catalog-repo-only remediation passes (see `haus-workflow-catalog`'s own audit-remaining-items plan) — not repeated here.
- The retracted "consume `coInstallWith`" follow-up — retracted along with the field itself per ADR-0020 (catalog repo); tracing real CLI source showed the file in question is already delivered via a hardcoded mechanism, not a manifest field.

## Suggested branch

```bash
git worktree add .claude/worktrees/combined-seam-remaining -b fix/combined-seam-remaining-items
```

Task 4 may warrant its own separate worktree given it's the highest-risk/newest-infra item — see Task 4 notes.
