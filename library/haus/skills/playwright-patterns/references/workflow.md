# Workflow

## Implementation steps

1. Run existing suite first: confirm baseline pass before changing anything
2. For new flow: create or extend a page object — never put `page.locator()` directly in spec
3. Use `data-testid` attributes for selectors — not CSS classes or text that changes with copy
4. For auth-dependent tests: use `storageState` fixture; re-record auth state if flow changed
5. Use `test.beforeEach` fixture seeding via API call — not UI setup steps
6. For flaky tests: identify root cause (missing `await`, timing, state leak) — never add `waitForTimeout`
7. Use `expect(locator).toBeVisible()` / `toHaveText()` — not `page.waitForSelector`
8. Run in headed mode to debug: `--headed --debug`; use Playwright Inspector for step-through

## Commands

```bash
yarn playwright test                                  # run all tests (headless)
yarn playwright test tests/e2e/feature.spec.ts        # run specific spec
yarn playwright test --grep "checkout flow"           # run by test title pattern
yarn playwright test --headed                         # run with browser visible
yarn playwright test --debug                          # open Playwright Inspector
yarn playwright test --project=chromium               # single browser
yarn playwright test --reporter=html && yarn playwright show-report  # HTML report

# Record new test
yarn playwright codegen http://localhost:3000

# Re-record auth state
yarn playwright test tests/e2e/auth.setup.ts --project=setup

# Update snapshots
yarn playwright test --update-snapshots
```

## Validation checklist

- [ ] No `page.waitForTimeout()` — use `expect(locator).toBeVisible()` or event-driven waits
- [ ] Selectors use `data-testid` — not brittle CSS classes or positional nth-child
- [ ] Auth state loaded from `storageState` — no manual login steps in test body
- [ ] Test setup via API calls, not UI navigation through setup screens
- [ ] Tests are isolated — no shared state between test files (`test.use({ storageState: ... })`)
- [ ] Passes in CI with `--project=chromium,firefox` (headless, no GPU flags needed)
- [ ] Page objects used for all locator definitions — specs contain only flow assertions
