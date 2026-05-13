# Workflow

## Implementation steps

1. Identify test type: unit (isolated class) or feature (HTTP + DB + real service stack)
2. For unit tests: instantiate class under test with mocked dependencies via `Mockery` or `$this->mock()`
3. For feature tests: use `RefreshDatabase` trait; seed with factory data; assert HTTP status and DB state
4. Use factories for all test data — no raw `DB::insert()` in tests
5. Assert behavior, not implementation: check response bodies and DB records, not internal method calls
6. For auth: use `$this->actingAs($user)` with a factory-built user with correct roles/permissions
7. Run suite in parallel with `--parallel` flag to identify isolation failures
8. Check coverage report for changed classes — target branch coverage, not line coverage

## Commands

```bash
php artisan test                              # run full suite
php artisan test --filter=FeatureClassName    # run specific test class
php artisan test --filter=test_method_name    # run specific test
php artisan test --parallel                   # run in parallel
php artisan test --coverage                   # generate coverage (requires Xdebug/PCOV)
php artisan test --profile                    # show slowest tests

vendor/bin/phpunit --testdox                  # readable test output
vendor/bin/phpunit tests/Unit/Services/       # run specific dir

php artisan make:test FeatureTest --unit      # generate unit test
php artisan make:test FeatureTest             # generate feature test
php artisan make:factory ModelFactory         # generate factory
```

## Validation checklist

- [ ] Feature tests use `RefreshDatabase` — no shared state between test methods
- [ ] Factories used for all model setup — no manual DB inserts
- [ ] Unauthorized user access tested with `$this->actingAs()` with wrong role
- [ ] Each test method name describes the scenario: `test_creates_order_when_stock_available`
- [ ] Mocked external services/HTTP calls — no real outbound calls in tests
- [ ] Test passes in isolation (`--filter`) and in full suite (`--parallel`)
- [ ] Coverage added for new branches introduced in service/action class
