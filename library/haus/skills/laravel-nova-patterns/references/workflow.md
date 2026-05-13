# Workflow

## Implementation steps

1. Locate or create Nova resource in `app/Nova/` — name matches Eloquent model
2. Define `fields()`: use typed field classes (`Text`, `Number`, `BelongsTo`, `HasMany`)
3. Set field visibility explicitly — default is shown everywhere; narrow with `showOnIndex`/`showOnDetail`
4. Add `rules()` and `creationRules()`/`updateRules()` for validation
5. For actions: implement `handle(ActionFields $fields, Collection $models)` — add `->canRun()` policy check
6. For filters: implement `apply(Request $request, Builder $query, $value)` — avoid unbounded scans
7. Verify policy: confirm `app/Policies/*Policy.php` has correct gates and is registered in `AuthServiceProvider`
8. Test in Nova UI: create, update, delete, run action — confirm authorization blocks unauthorized users
9. Run PHPUnit feature tests covering the changed resource behavior

## Commands

```bash
php artisan nova:resource ModelName      # generate Nova resource
php artisan nova:action ActionName       # generate action class
php artisan nova:filter FilterName       # generate filter class
php artisan nova:lens LensName           # generate lens class

php artisan test --filter=Nova           # run Nova-related tests
php artisan route:list | grep nova       # inspect registered Nova routes
php artisan policy:make ModelPolicy      # generate policy
```

## Validation checklist

- [ ] Sensitive fields (password, token, PII) excluded from index view
- [ ] All filter/lens queries use indexed columns — check with EXPLAIN
- [ ] Action `canRun()` gates checked; unauthorized users cannot execute
- [ ] BelongsTo / relatable fields have `searchable()` if model count is large
- [ ] Policy registered in `AuthServiceProvider::$policies`
- [ ] Nova resource `$model` property matches correct Eloquent class
- [ ] Queued actions use correct queue connection from config
