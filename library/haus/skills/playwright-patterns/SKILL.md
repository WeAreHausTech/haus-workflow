---
name: playwright-patterns
description: Playwright router. Use for E2E browser test flows, selectors, fixtures, and test stability work.
---

# Playwright Patterns

## Use when

- task changes E2E test flows, page objects, test fixtures, or browser assertions
- task touches `playwright.config.*`, `tests/e2e/*`, or helper fixtures

## Do not use when

- task is unit/integration test only with no browser automation
- task is production runtime code unrelated to test flow changes

## Inspect first

- affected test spec files and fixtures
- shared selectors/page objects and setup helpers
- app routes/components involved in failing flow

## Avoid mistakes

- brittle selectors coupled to cosmetic markup
- hidden cross-test state leakage in fixtures
- adding waits instead of waiting on deterministic signals

## Router

1. Load `references/scope.md` for test-fixture boundaries.
2. Load `references/workflow.md` only for failure triage loop.
3. Prefer deterministic assertions over timing guesses.

## References

- references/scope.md
- references/workflow.md
