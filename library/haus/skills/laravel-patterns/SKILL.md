---
name: laravel-patterns
description: Laravel router. Use for app/domain changes across controllers, services, models, jobs, and policies.
---

# Laravel Patterns

## Use when

- task changes Laravel app behavior in `app/`, `routes/`, `database/`
- task touches controllers, jobs, policies, service classes, or Eloquent models

## Do not use when

- task is Nova admin-only resource customization
- task is frontend-only SPA component work outside Laravel backend

## Inspect first

- `routes/*.php` and feature controller/service/model files
- migrations and model casts/relations for behavior changes
- queued jobs/listeners if side effects are async

## Avoid mistakes

- writing business rules directly in controllers
- skipping validation/authorization in form requests or policies
- changing DB behavior without matching migration and test updates

## Router

1. Load `references/scope.md` for file layout.
2. Load `references/workflow.md` only for request-to-persistence flow work.
3. Keep domain logic in services/actions, not route files.

## References

- references/scope.md
- references/workflow.md
