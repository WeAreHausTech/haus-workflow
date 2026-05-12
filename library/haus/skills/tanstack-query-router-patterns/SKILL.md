---
name: tanstack-query-router-patterns
description: TanStack Query/Router router. Use for query keys, loaders, route state, and invalidation behavior.
---

# Tanstack Query Router Patterns

## Use when

- task changes cache/query behavior, route loaders, or navigation-driven data flow
- task touches `@tanstack/react-query` or `@tanstack/react-router` integration files

## Do not use when

- task is component styling only with no query/router change
- task is backend API implementation with no client data-layer impact

## Inspect first

- query key factory/hooks and mutation invalidation points
- route definitions/loaders/search-param parsing
- error/loading boundary components for changed routes

## Avoid mistakes

- unstable query keys causing stale-cache collisions
- route loader duplication with component-level fetching
- mutation success paths without invalidation or optimistic rollback

## Router

1. Load `references/scope.md` for query/router touchpoints.
2. Load `references/workflow.md` only for cache-navigation debugging.
3. Keep query key and route param contracts deterministic.

## References

- references/scope.md
- references/workflow.md
