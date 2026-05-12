---
name: tailwind-scss-patterns
description: Styling router for Tailwind CSS and SCSS modules. Use for style architecture, tokens, and component-level styling behavior.
---

# Tailwind Scss Patterns

## Use when

- task changes utility-class strategy, SCSS module structure, or style token usage
- task touches styling files coupled to React/Next/Vite components

## Do not use when

- task is data-layer/backend behavior with no style changes
- task is Radix/shadcn component logic without style system impact

## Inspect first

- component files plus paired `*.module.scss` or style utility files
- Tailwind config/theme/token files
- class composition helpers and variant mapping files

## Avoid mistakes

- mixing global selectors into module-scoped styles unintentionally
- utility-class sprawl that duplicates tokenized component styles
- non-deterministic class ordering causing override bugs

## Router

1. Load `references/scope.md` for style-layer touchpoints.
2. Load `references/workflow.md` only for style resolution/debug flow.
3. Keep token and variant usage consistent with project style system.

## References

- references/scope.md
- references/workflow.md
