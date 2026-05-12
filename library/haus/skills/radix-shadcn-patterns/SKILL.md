---
name: radix-shadcn-patterns
description: Radix/shadcn router. Use for accessible primitives, composition wrappers, and design-system-level UI behavior.
---

# Radix Shadcn Patterns

## Use when

- task changes Radix primitive usage, shadcn wrappers, or accessibility-sensitive interaction components
- task touches shared UI components based on `@radix-ui/*` or shadcn patterns

## Do not use when

- task is domain/business logic with no UI primitive impact
- task is one-off page markup not using shared UI primitives

## Inspect first

- affected primitive wrappers and variant utility files
- keyboard/focus/aria handling in changed components
- usage call sites where component API changes propagate

## Avoid mistakes

- breaking keyboard/focus trap behavior in dialogs/menus
- diverging wrapper props from underlying primitive contracts
- adding ad-hoc styles that bypass component tokens

## Router

1. Load `references/scope.md` for primitive-wrapper map.
2. Load `references/workflow.md` only for interaction/accessibility flow.
3. Verify focus, keyboard, and aria behavior after edits.

## References

- references/scope.md
- references/workflow.md
