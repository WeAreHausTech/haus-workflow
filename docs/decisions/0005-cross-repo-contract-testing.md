# ADR-0005: Cross-repo contract testing between the CLI and the catalog

- **Status:** Accepted | **Date:** 2026-06-04

## Context

The catalog repo (`WeAreHausTech/haus-workflow-catalog`) is the source of truth
for `validation-rules.json`, `manifest.json`, and `schema/*.json`. This CLI ships
**synced copies** (`library/catalog/validation-rules.json`, the bundled schema
stubs) and a curated **test fixture** (`tests/fixtures/catalog/manifest.json`).

These copies drift silently: the catalog changes, no sync PR lands, and the
divergence only surfaces at a downstream user's `haus install` — far from where
it was introduced. ADR-0001 made `validation-rules.json` a single source of
truth, but nothing actively detected when the synced copy fell behind. The test
fixture is deliberately a frozen curated subset (for deterministic CLI tests),
so it can never be byte-compared to the live catalog — yet it must not use a
field the schema removed, nor omit a field the schema newly requires.

## Decision

Add a two-layer contract check:

1. **Live-vs-committed drift check** (`scripts/contract-check.mjs`, network).
   Fetches the live catalog at `HAUS_CATALOG_REF` (default `main`) and checks:
   - BP#1: committed `validation-rules.json` is identical to live (must match,
     per ADR-0001).
   - BP#3: the test fixture vs the live `catalog-item`/`manifest` schemas on a
     **key-set basis** — fails only if the fixture uses a removed field or omits
     a newly-required one. `version` is an explicit decoupling exemption.
   - BP#5: the live `haus-lock` schema's `catalogRef` is an optional string,
     matching the CLI writer. Skipped (logged) if no such schema exists.
   - Degrades gracefully offline (WARN + exit 0) unless `CONTRACT_STRICT=1`.
   - Strictness: PR = WARN (exit 0); main push / scheduled cron = FAIL.
     Runs in `.github/workflows/contract-drift.yml` on PR, push to main, and a
     daily cron.

2. **Offline invariants** (`tests/contract-invariants.test.js`, in `yarn test`).
   Assert the committed fixture stays internally consistent with the catalog-item
   contract without a network call (known-field set, required-field set, enum
   validity, lock-schema stub `$ref` integrity).

Also flip the Phase-2 coverage + ratchet CI steps from `continue-on-error: true`
to blocking, and add a `fix-needs-test` PR gate (a `fix:` commit must touch
`tests/`, escape hatch `[skip-regression-test]`).

## Consequences

- Catalog drift is caught in CI (and daily) instead of at install time.
- The fixture can stay a curated subset; the key-set check decouples it from
  byte-equality while still catching contract-breaking edits.
- PRs are not blocked by out-of-band catalog changes (sync is a separate flow);
  main/cron enforce hard.
- `contract-check.mjs` depends on GitHub raw availability; offline tolerance
  prevents flaky CI, at the cost of not catching drift on a network blip (the
  daily cron and main push backstop this).

## Alternatives considered

- **Byte-compare the fixture to the live manifest.** Rejected: the fixture is a
  deliberate curated subset; byte-equality would force it to mirror the full
  production catalog and defeat its purpose.
- **Vendor a JSON-schema validator (ajv).** Rejected: the repo has no ajv and
  the contract is expressible as a key-set/enum structural check; adding a dep
  for this is unjustified.
- **Runtime fetch of validation rules instead of a synced copy.** Rejected by
  ADR-0001 — validation is release-coupled, not runtime-fetched.
