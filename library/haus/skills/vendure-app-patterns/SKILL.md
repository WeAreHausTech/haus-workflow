---
name: vendure-app-patterns
description: Vendure app router. Use for app-level config, workers, jobs, and API extensions in a Vendure application.
---

# Vendure App Patterns

## Use when

- task updates Vendure app config, workers, bootstrap, or plugin wiring
- task touches `vendure-config.*`, `src/index.ts`, `worker.ts`, app bootstrap modules

## Do not use when

- task is isolated shared plugin package work
- task is frontend-only storefront/admin UI work

## Router

1. Inspect app entry/config files before touching plugin code.
2. Load `references/scope.md` for app module boundaries.
3. Load `references/workflow.md` only for startup/worker/debug flows.
4. Validate both server and worker impact for changed behavior.

## References

- references/scope.md
- references/workflow.md
