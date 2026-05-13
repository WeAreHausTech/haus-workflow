# Scope

## In-scope files and dirs

- `tests/Unit/**/*.php` — isolated unit tests, no database or HTTP
- `tests/Feature/**/*.php` — feature tests using `RefreshDatabase` and HTTP testing
- `database/factories/**/*.php` — model factories for test data generation
- `database/seeders/**/*.php` — seeders used in test setup
- `tests/TestCase.php` — base test class and shared setUp
- `phpunit.xml` / `phpunit.xml.dist` — test suite config, env overrides, coverage settings
- `tests/Traits/**` — shared test trait helpers (e.g., `ActsAsUser`, `WithFakeStorage`)

## Stack boundaries

- Laravel PHPUnit: HTTP testing (`$this->getJson`, `$this->postJson`), database assertions
- Unit scope: service/action classes in isolation with mocked dependencies
- Feature scope: full HTTP request → controller → service → DB → response
- Not in scope: browser behavior tests (use playwright-patterns)
- Not in scope: JavaScript component tests (use testing-library-patterns)

## Triggers

- Adding or changing service/action class behavior
- Changing controller validation or response structure
- Adding or modifying Eloquent model factory
- Changing database migration (requires corresponding feature test update)
- Adding authorization policy (needs policy-gate assertion in feature test)
- Fixing a production bug (add regression test first)
