# Workflow

## Implementation steps

1. Use custom `renderWithProviders` wrapper — never use bare `render()` without router/store providers
2. Query by accessible role first: `getByRole('button', { name: /submit/i })`
3. For forms: `userEvent.type(input, 'value')` + `userEvent.click(submitButton)` — not `fireEvent`
4. For async operations: use `findByRole` or `waitFor(() => expect(...).toBeTruthy())`
5. For API calls: use MSW handler in `src/mocks/handlers.ts` — not `jest.mock('fetch')`
6. Assert on user-visible text, roles, and accessible names — not component internal state
7. For hooks: use `renderHook` from `@testing-library/react`
8. Keep each test scoped to one behavior — split into multiple `it()` blocks

## Commands

```bash
jest                                                # run all tests
jest --testPathPattern src/components/Button       # run tests for specific component
jest --watch                                       # watch mode
jest --coverage --collectCoverageFrom="src/**"     # coverage report
jest --verbose                                     # show test names

# Update snapshots (only if using snapshots intentionally)
jest --updateSnapshot

# MSW setup check
# Ensure jest.setup.ts includes: server.listen(), afterEach(server.resetHandlers()), afterAll(server.close())
```

## Validation checklist

- [ ] `getByRole` used as primary query — no `getByTestId` unless role/label impossible
- [ ] `userEvent` used over `fireEvent` for realistic user interaction simulation
- [ ] `findBy*` used for async-appearing elements — no manual `setTimeout` or sleep
- [ ] API calls mocked via MSW in `src/mocks/handlers.ts` — no `jest.fn()` on fetch/axios
- [ ] Tests assert on visible output (text, role, aria-label) — not component state variables
- [ ] `act()` not called manually — RTL wraps interactions automatically
- [ ] Custom render wrapper includes all required providers (Router, QueryClient, ThemeProvider)
