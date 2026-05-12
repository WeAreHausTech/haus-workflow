---
name: dotnet-patterns
description: .NET router. Use for service/application layer changes, API endpoints, and persistence behavior in .NET projects.
---

# Dotnet Patterns

## Use when

- task changes .NET service/API/domain behavior
- task touches `Program.cs`, controllers/endpoints, services, repositories, or EF models

## Do not use when

- task is frontend-only build/UI work
- task is non-.NET backend stack behavior

## Inspect first

- app bootstrap and DI setup (`Program.cs`, startup modules)
- feature controller/endpoint + service + repository chain
- migration/model config when persistence contracts change

## Avoid mistakes

- putting business logic into controllers directly
- changing DTO contracts without validation and mapping updates
- skipping cancellation/async handling in I/O-heavy code

## Router

1. Load `references/scope.md` for common .NET file locations.
2. Load `references/workflow.md` only for request-to-storage flow debugging.
3. Keep transport, domain, and persistence layers separated.

## References

- references/scope.md
- references/workflow.md
