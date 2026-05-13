# Scope

## In-scope files and dirs

- `src/queries/**`, `src/hooks/use*.ts` — query key factories, `useQuery`/`useMutation` hooks
- `src/routes/**` — TanStack Router file-based route definitions (`*.route.tsx`, `__root.tsx`)
- `src/routeTree.gen.ts` — auto-generated route tree (do not edit manually)
- `src/**/*.loader.ts` — route loader functions
- `src/queryClient.ts` — `QueryClient` instance and default options
- `src/**/*.mutation.ts` — mutation hooks with invalidation logic
- `src/router.ts` — router instance and config

## Stack boundaries

- TanStack Query v5: query keys as arrays, `queryOptions()` factory, structural sharing
- TanStack Router v1: file-based routing, type-safe search params, loaders, beforeLoad
- Not in scope: component styling or UI-only changes with no query/router impact
- Not in scope: backend API implementation (use appropriate backend skill)

## Triggers

- Adding a new `useQuery` or `useMutation` hook
- Changing query key structure (breaks cache lookups)
- Adding or changing route loader (`loader` in route definition)
- Adding search param parsing to a route (`validateSearch`)
- Changing mutation success handler invalidation targets
- Adding optimistic update logic to a mutation
- Changing `QueryClient` default `staleTime`, `gcTime`, or retry config
