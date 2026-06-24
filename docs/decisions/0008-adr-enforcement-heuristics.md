# ADR-0008: Decision gate heuristics

- **Status:** Accepted | **Date:** 2026-06-24

## Context

ADR enforcement needs a testable rule for "decision-worthy" diffs. False positives erode trust; false negatives lose traceability.

## Decision

Use `library/catalog/decisions-triggers.json` with:

- Path globs (deps, schema, CI, infra, API contracts)
- Size thresholds (8+ files across 2+ top-level dirs, or 200+ lines non-docs)
- Satisfaction: new `docs/decisions/NNNN-*.md` with required sections + README index row
- `[adr-skip]` in PR body for non-security changes; ignored when security path globs match

## Motivation (why)

Same trigger file in catalog and CLI prevents drift. Broad paths + strict satisfaction balance noise vs coverage.

## Alternatives considered

- **Commit-message tags only** — rejected; easy to forget.
- **Warn-only CI** — rejected per product choice (hard gate from day one).

## Consequences

- Tune `decisions-triggers.json` from real PR feedback.
- `haus doctor` advises index drift and legacy `docs/adr/` migration.
