# Workflow

## Implementation steps

1. For new data: define query key factory first — `[entity, id, ...filters]` structure
2. Create `queryOptions()` definition: `queryFn`, `queryKey`, `staleTime` — reuse across components and loaders
3. For route loaders: call `queryClient.ensureQueryData(queryOptions(...))` — avoids waterfall on navigation
4. For mutations: implement `onSuccess` that calls `queryClient.invalidateQueries` with precise key prefix
5. For optimistic updates: use `onMutate` / `onError` / `onSettled` pattern — always roll back on error
6. For search params: define `validateSearch` with Zod schema in route definition — never use raw `useSearch`
7. Run `tsc` to verify route tree type inference is intact after route changes
8. Re-generate route tree if routes added: `yarn tsr generate` or `tsr watch`

## Commands

```bash
# TanStack Router codegen
yarn tsr generate                     # generate routeTree.gen.ts
yarn tsr watch                        # watch mode for route tree updates

# Type check
yarn tsc --noEmit

# Dev
vite dev / next dev                  # TanStack Router devtools show query cache in browser

# Tests
jest --testPathPattern queries/
jest --testPathPattern routes/
```

## Validation checklist

- [ ] Query key factory is a pure function returning a stable array — no object literals inline
- [ ] `staleTime` set per query category — not relying solely on global default
- [ ] Route loader prefetches data using `queryClient.ensureQueryData` — not a duplicate `useQuery`
- [ ] Mutation `invalidateQueries` targets the minimal necessary key prefix
- [ ] Optimistic update always has `onError` rollback restoring previous cache value
- [ ] Search params validated via Zod schema in `validateSearch` — never parsed manually
- [ ] `routeTree.gen.ts` committed and up-to-date with current route files
