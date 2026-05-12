---
name: turbo-monorepo-patterns
description: Turbo monorepo router. Use for pipeline graph, package tasks, and cache-aware workspace execution.
---

# Turbo Monorepo Patterns

## Use when

- task changes `turbo.json`, package task graph, or workspace script contracts
- task impacts cache, pipeline dependencies, or cross-package build order

## Do not use when

- task is app-only feature change without workspace orchestration impact
- repo is Nx-only and does not use Turbo pipeline

## Inspect first

- `turbo.json` pipeline definitions
- root/package scripts consumed by pipeline tasks
- workspace package dependencies for changed package

## Avoid mistakes

- task name drift between pipeline and package scripts
- missing `dependsOn` leading to stale artifacts
- cache invalidation misses caused by incorrect inputs/outputs

## Router

1. Load `references/scope.md` for pipeline/package targets.
2. Load `references/workflow.md` only for cache/pipeline debug flow.
3. Keep task graph reproducible in CI and local runs.

## References

- references/scope.md
- references/workflow.md
