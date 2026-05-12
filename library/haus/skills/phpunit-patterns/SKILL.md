---
name: phpunit-patterns
description: PHPUnit router. Use for Laravel/PHP backend behavior tests, feature/unit scope, and assertion strategy.
---

# PHPUnit Patterns

## Use when

- task changes PHP/Laravel backend behavior and needs unit/feature test updates
- task touches `tests/Unit/*`, `tests/Feature/*`, factories, or test setup traits

## Do not use when

- task is frontend/browser behavior better covered by JS testing tools
- task is infrastructure config with no PHP behavior change

## Inspect first

- impacted feature/unit tests and related factories/seeders
- changed service/controller/model code under test
- test bootstrap config and custom assertion helpers

## Avoid mistakes

- testing framework internals instead of business behavior
- combining too many concerns in one feature test
- relying on production-like side effects without isolation

## Router

1. Load `references/scope.md` for PHPUnit file targeting.
2. Load `references/workflow.md` only for failing-test diagnosis flow.
3. Keep tests behavior-focused and deterministic.

## References

- references/scope.md
- references/workflow.md
