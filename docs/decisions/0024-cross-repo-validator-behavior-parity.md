# ADR-0024: Cross-repo validator behavior-parity check

- **Status:** Accepted
- **Date:** 2026-08-05
- **Decided by:** Aniisa Bihi (draft by Claude; design approved in session before implementation)
- **Affects:** `scripts/contract-behavior-check.mjs`, `tests/contract-behavior.test.js`, `tests/fixtures/contract-behavior/`, `.github/workflows/contract-drift.yml`
- **Related:** [audit](https://claude.ai/code/artifact/1abe9002-8ef0-4680-b2ab-3215aa4cf7bd) §B / §D item 3, [plan](../plans/combined-seam-remaining-items.md) task 4, ADR-0005 (this repo), ADR-0001 (haus-workflow-catalog)

## Context

`scripts/validate-core.mjs` (catalog repo) and `src/catalog/validate-core.ts` (this
repo) are two hand-written implementations of the same rules, tied together only by
a source comment asking a human to keep them in sync. ADR-0005 already added a
contract check between the two repos, but it only compares **data/schema shape**:
committed `validation-rules.json` byte-identical to live, the test fixture's
key-set vs. the live schema, the lock-schema shape. It never runs both validators'
actual logic against the same items — so a rule added to one side's audit function
and forgotten on the other (exactly what happened with `auditSafetyNotes`/
`auditIntents`/`auditDiskOrphans` before this plan's tasks 2-3) would pass ADR-0005's
check indefinitely, since the rule _data_ can be perfectly in sync while the
_enforcement code_ diverges.

## Decision

Add a second, additive contract check that runs both validators against a shared
golden fixture set and asserts they agree on every item's pass/fail verdict.

**Fixture sourcing — live sibling checkout, not a vendored copy (option (a) from
the plan doc):**

- `scripts/contract-behavior-check.mjs` resolves the catalog repo's root via
  `HAUS_CATALOG_REPO_PATH` (default: `../haus-workflow-catalog` relative to this
  repo's root — the actual on-disk layout in every dev environment this was
  authored in, and reproducible in CI via a second `actions/checkout`).
- If the path doesn't exist: `console.warn` + exit 0, unless `CONTRACT_STRICT=1`
  (then exit 1) — same graceful-degradation contract as ADR-0005's
  `contract-check.mjs`, so a local run without the sibling repo checked out
  doesn't spuriously fail.
- When found, it dynamically `import()`s the catalog repo's **live**
  `scripts/validate-core.mjs` by absolute file path (Node resolves that module's
  own relative imports and its `ajv` dependency against the catalog repo's own
  `node_modules` — requires that repo's deps installed) and calls this repo's own
  `validateCatalogData()` directly (no subprocess) — both against the exact same
  fixture directory (`tests/fixtures/contract-behavior/`) committed in _this_ repo.
- Verdict comparison is pass/fail only (`ok` boolean per item — did each side flag
  it or not), not failure-message text — the two implementations word failures
  differently on purpose (this repo's messages read "item.id: reason", the catalog
  repo's the same shape but independently maintained strings); asserting message
  equality would make the check brittle for reasons that aren't drift.

**Why not vendor a frozen copy (option (b)):** a vendored fixture/audit-function
copy tests old code, not the current logic on both sides — it would need its own
sync mechanism (defeating the point) and could go stale exactly like the gap this
ADR closes. Live-checkout means the check always exercises what's actually shipped
today.

**Fallback if live-checkout CI proves fragile:** if the sibling-checkout step in CI
becomes a maintenance burden (flaky installs, org-repo access issues), fall back to
vendoring a frozen fixture + a pinned copy of just the pure audit functions, with an
explicit staleness check (e.g. compare a hash of the vendored functions against the
live ones, similar to ADR-0005's drift detection) — not attempted now since (a)
works and is simpler.

**Strictness model — same event-based tiers as ADR-0005:**

- `pull_request`: mismatch → WARN (exit 0).
- `push` to `main` / scheduled cron: mismatch → FAIL.
- Unlike ADR-0005's `contract-check.mjs` (deliberately network-only, no checkout,
  to stay fast on every PR), this check runs the real comparison on **every**
  trigger including PRs — CI always checks out `haus-workflow-catalog` as a
  second directory (it's a cheap, public-repo checkout) and runs
  `yarn install` there so its `validate-core.mjs` can resolve its own `ajv`
  dependency. Only the pass/fail _strictness_ differs by event, not whether the
  check actually runs — a PR gets a real, fast signal it can choose to ignore
  (WARN), not a check that's silently skipped every time.

## Consequences

- Catches the exact class of gap that motivated this ADR (validator logic drift
  behind in-sync rule data) — this repo's own tasks 2-3 closing that gap first is
  what let this check start green rather than red.
- CI cost: a second checkout + `yarn install` for the catalog repo on **every**
  trigger, including PRs (see strictness model above) — a few extra seconds per
  run, traded for a real signal on PRs instead of a perpetual skip.
- Coupled to `haus-workflow-catalog` staying a public (or otherwise
  CI-accessible) repo for the second checkout to succeed unauthenticated;
  currently true.
- Fixture set (`tests/fixtures/contract-behavior/`) is deliberately small — one
  item per known audit category — and needs a new entry whenever a new audit is
  added to either validator, or this check silently stops covering it. No
  automated reminder for that today; flagged as a known limitation, not solved
  here.

## Alternatives considered

- **Vendor a frozen fixture + audit-function copy.** Rejected for now — see
  "Why not vendor" above; kept as documented fallback.
- **Byte-compare the two `.mjs`/`.ts` source files.** Rejected — they're written
  in different languages (JS vs. TypeScript) with different helper signatures by
  design (per ADR-0001); source-diffing was never the goal, behavioral agreement
  is.
- **Extend ADR-0005's `contract-check.mjs` instead of adding a new script.**
  Rejected — that script is deliberately network-only (live GitHub raw fetch, no
  sibling checkout, no `yarn install`) for fast unauthenticated CI on every PR;
  merging in a checkout-dependent, slower behavioral check would regress that
  property for everyone.
