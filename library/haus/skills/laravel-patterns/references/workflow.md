# Workflow

## Implementation steps

1. Define route in appropriate routes file — use resource routes where applicable
2. Create or modify FormRequest: `authorize()` returns policy check, `rules()` defines validation
3. Keep controller thin: delegate to service/action class for business logic
4. In service/action: implement domain logic; inject repositories or Eloquent models
5. For Eloquent changes: add relation/cast first, then migration if schema changes
6. For async operations: dispatch a job with typed constructor; set queue/connection in config
7. Add or update policy: test both `true` and `false` authorization paths
8. Write feature test using `RefreshDatabase` + factory; assert HTTP response and DB state

## Commands

```bash
php artisan make:controller FeatureController --resource
php artisan make:request StoreFeatureRequest
php artisan make:service FeatureService        # if using artisan-service package
php artisan make:model Feature -mf             # model + migration + factory
php artisan make:job ProcessFeature
php artisan make:policy FeaturePolicy --model=Feature
php artisan make:event FeatureCreated
php artisan make:listener HandleFeatureCreated --event=FeatureCreated

php artisan migrate                            # apply migrations
php artisan test --filter=Feature             # run feature tests
php artisan route:list --path=api/feature     # inspect routes
php artisan queue:work --once                  # process one job locally
```

## Validation checklist

- [ ] Business logic lives in service/action — not in controller or model
- [ ] FormRequest used for all incoming data — no raw `$request->input()` in controllers
- [ ] Eloquent relations use correct key names and eager-loaded where N+1 risk exists
- [ ] Jobs implement `ShouldBeUnique` or have idempotency where needed
- [ ] Policy registered in `AuthServiceProvider` and tested for unauthorized case
- [ ] Migration is reversible — `down()` method tested
- [ ] Feature test covers success path, validation failure, and unauthorized access
