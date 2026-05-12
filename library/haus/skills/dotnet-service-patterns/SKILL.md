---
name: dotnet-service-patterns
description: .NET service router focused on service boundaries, contracts, and operational behavior.
---

# Dotnet Service Patterns

## Use when

- task changes service-level business logic, background jobs, or integration handlers
- task touches service contracts, handlers, or domain orchestration classes

## Do not use when

- task is only API route/controller formatting with no service change
- task belongs to unrelated stack/runtime

## Inspect first

- service interfaces + implementations
- domain models/value objects touched by service behavior
- integration adapters and error handling paths

## Avoid mistakes

- expanding service scope into multi-domain god services
- inconsistent retry/idempotency for side-effecting operations
- swallowing exceptions without telemetry/context

## Router

1. Load `references/scope.md` for service boundary map.
2. Load `references/workflow.md` only for execution/error path checks.
3. Keep domain orchestration explicit and testable.

## References

- references/scope.md
- references/workflow.md
