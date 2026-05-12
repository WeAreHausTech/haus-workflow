---
name: vue-patterns
description: Vue router. Use for component/composable behavior, route-level state, and Vue app feature changes.
---

# Vue Patterns

## Use when

- task changes Vue components, composables, or route-bound feature behavior
- task touches Vue app files using `vue` runtime APIs and project conventions

## Do not use when

- task is React/Next-specific component behavior
- task is backend-only API/service implementation

## Inspect first

- affected `*.vue` components and nearby composables/stores
- route definitions and feature module boundaries
- tests/specs covering impacted UI behavior

## Avoid mistakes

- mutating props directly inside components
- leaking global state changes into unrelated feature scopes
- mixing composition and options patterns inconsistently in one feature

## Router

1. Load `references/scope.md` for component/composable touchpoints.
2. Load `references/workflow.md` only for state-event-render tracing.
3. Keep composables reusable and feature state boundaries explicit.

## References

- references/scope.md
- references/workflow.md
