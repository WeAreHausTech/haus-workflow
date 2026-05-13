# Workflow

## Implementation steps

1. Identify component role: pure presentational, stateful, or connected to global store
2. For new state: start local (`useState`); elevate to context/store only if shared across tree
3. Check `useEffect` usage: prefer event handlers and React 19 `use()` + server data over effects
4. For async transitions: wrap non-urgent updates in `startTransition`; show pending UI via `useTransition`
5. For optimistic UI: use `useOptimistic` — update state immediately, revert on server error
6. For form mutations: use `useActionState` with server action; display field errors from returned state
7. Memoize only when profiler shows actual re-render cost — not pre-emptively
8. Write tests: render component, simulate user events via `userEvent`, assert visible output

## Commands

```bash
yarn tsc --noEmit                          # type check component props
jest --testPathPattern components/        # run component tests
jest --testPathPattern hooks/             # run hook tests

# React DevTools Profiler
# Use browser extension — no CLI equivalent

# Storybook for interactive component review
yarn storybook dev -p 6006

# Bundle analysis (Next.js)
ANALYZE=true next build
```

## Validation checklist

- [ ] No direct prop mutation — always derive new state/object
- [ ] `useEffect` dependencies array complete — ESLint `react-hooks/exhaustive-deps` passes
- [ ] `"use client"` directive placed at lowest possible component in tree
- [ ] `Suspense` boundary added above any component using `use()` or lazy loading
- [ ] `useCallback` / `useMemo` only used where React DevTools Profiler confirms benefit
- [ ] `useOptimistic` rollback tested — server error path reverts UI correctly
- [ ] Event handlers do not create new function references in render unless memoized
