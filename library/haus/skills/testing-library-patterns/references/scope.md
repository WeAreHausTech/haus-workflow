# Scope

## In-scope files and dirs

- `src/**/*.test.tsx`, `src/**/*.test.ts` — component and hook tests using RTL
- `src/**/*.spec.tsx` — alternative spec naming convention
- `src/test-utils/**`, `src/utils/test-helpers.*` — custom render wrappers, provider setup
- `jest.config.ts` / `jest.config.js` — test runner config, transform, module aliases
- `jest.setup.ts` — global setup: `@testing-library/jest-dom`, MSW server, global mocks
- `src/mocks/**` — MSW handlers for API mocking in tests

## Stack boundaries

- `@testing-library/react` and `@testing-library/user-event` v14+
- Query priority: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`
- Async: `findBy*` for eventually-visible elements; `waitFor` for non-element assertions
- Not in scope: E2E browser flows (use playwright-patterns)
- Not in scope: backend service logic tests (use jest unit tests without RTL)

## Triggers

- Adding or modifying a React component's interactive behavior
- Adding a custom hook with async or state logic
- Changing form validation or error message rendering
- Adding accessible ARIA attributes that affect query strategy
- Changing component loading/error states
- Fixing a failing RTL test after component refactor
