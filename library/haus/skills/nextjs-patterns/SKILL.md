---
name: nextjs-patterns
description: Next.js router. Use for App Router pages, server components, route handlers, and Next config behavior.
---

# Nextjs Patterns

## Use when

- task changes `app/` routes, layouts, server actions, or route handlers
- task touches `next.config.*`, middleware, or rendering/data-fetch boundaries

## Do not use when

- task is backend service logic outside Next.js runtime
- task is pure component-library work not coupled to Next routing

## Inspect first

- `app/**/page.tsx`, `layout.tsx`, `route.ts`, and route segment config
- `middleware.ts` and auth/caching integration files
- feature data loaders/server actions tied to changed routes

## Avoid mistakes

- mixing client-only hooks into server components
- duplicate fetching across layout/page boundaries causing cache drift
- route handler changes without auth and revalidation checks

## Router

1. Load `references/scope.md` for route/file targeting.
2. Load `references/workflow.md` only when tracing render/data flow.
3. Keep boundary clear between server and client components.

## References

- references/scope.md
- references/workflow.md
