# Scope

## In-scope files and dirs

- `src/components/**/*.tsx` — React component files (client and shared)
- `src/hooks/**/*.ts` — custom hooks (`use*.ts`)
- `src/context/**` — React context providers and consumers
- `src/stores/**` — Zustand / Jotai / Redux Toolkit slices consumed by components
- `src/**/*.stories.tsx` — Storybook stories (component contract reference)
- `src/**/*.test.tsx` — component unit/integration tests

## Stack boundaries

- React 19: `use()` hook, `useOptimistic`, `useActionState`, `useTransition`, `startTransition`
- Server/client boundary: `"use client"` marks client component entry points in Next.js/RSC
- State: local (`useState`), derived (`useMemo`/`useCallback`), global (context/store)
- Not in scope: server component data fetching without client state impact
- Not in scope: routing logic not involving React component state

## Triggers

- Adding or changing component state (`useState`, `useReducer`, context)
- Adding or modifying custom hooks
- Adding `Suspense` boundaries or deferred rendering
- Using `useOptimistic` or `useActionState` for mutation feedback
- Changing component composition or prop interface
- Adding `useTransition` to defer non-urgent state updates
- Fixing stale closure bugs in event handlers or effects
