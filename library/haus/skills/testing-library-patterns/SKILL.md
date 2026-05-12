---
name: testing-library-patterns
description: Testing Library router. Use for component behavior tests, queries by role/text, and user-driven assertions.
---

# Testing Library Patterns

## Use when

- task changes component behavior covered by Testing Library tests
- task touches render helpers, user-event interactions, or accessibility assertions

## Do not use when

- task is browser E2E flow better covered by Playwright
- task is backend-only logic with no rendered UI interaction

## Inspect first

- affected test files using `@testing-library/*`
- changed component and its providers/test setup
- helper utilities for render wrappers and mock state

## Avoid mistakes

- asserting implementation details instead of user-visible outcomes
- overusing snapshots for behavior-sensitive interactions
- bypassing async UI updates without `findBy`/wait utilities

## Router

1. Load `references/scope.md` for test target map.
2. Load `references/workflow.md` only for flaky/failing test triage.
3. Assert behavior by role/text/action, not internals.

## References

- references/scope.md
- references/workflow.md
