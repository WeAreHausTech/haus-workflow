---
name: laravel-nova-patterns
description: Laravel Nova router. Use for admin resources, actions, fields, filters, and policies.
---

# Laravel Nova Patterns

## Use when

- task changes Nova admin resources, fields, actions, cards, or filters
- task touches `app/Nova/*`, resource policies, or Nova tool integration

## Do not use when

- task is customer-facing API/domain change without admin UI impact
- task belongs to non-Laravel admin stacks

## Inspect first

- `app/Nova/*` resource classes and custom fields/actions
- linked Eloquent model + policy files
- validation rules and lens/filter query logic

## Avoid mistakes

- exposing sensitive fields in index/detail views
- writing expensive unbounded queries in filters/lenses
- mismatching resource field rules vs model validation/policies

## Router

1. Load `references/scope.md` for Nova file targets.
2. Load `references/workflow.md` only for resource lifecycle flow.
3. Verify admin authorization and data visibility before handoff.

## References

- references/scope.md
- references/workflow.md
