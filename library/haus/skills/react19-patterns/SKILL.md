---
name: react19-patterns
description: React 19 router. Use for component behavior, hooks, state boundaries, and composition patterns.
---

# React19 Patterns

## Use when

- task changes component behavior, hook logic, or state transitions
- task touches feature UI in React app, Next client components, or design system

## Do not use when

- task is backend API/domain/storage only
- task is framework-level routing/config not tied to React component logic

## Inspect first

- changed component tree and nearby hooks/util files
- state provider/store boundaries for impacted feature
- tests/stories that define expected interaction behavior

## Avoid mistakes

- mutating props/state derived objects directly
- over-fetching data in deeply nested components
- mixing unrelated concerns into shared design-system primitives

## Router

1. Load `references/scope.md` for component/hook target map.
2. Load `references/workflow.md` only for render-state-event flow.
3. Keep component contracts explicit and localize side effects.

## References

- references/scope.md
- references/workflow.md
