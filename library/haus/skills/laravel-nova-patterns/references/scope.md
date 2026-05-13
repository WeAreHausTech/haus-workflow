# Scope

## In-scope files and dirs

- `app/Nova/**/*.php` — Nova resource classes, custom fields, actions, lenses, cards
- `app/Policies/**/*.php` — model policies used by Nova authorization
- `app/Nova/Actions/**` — queued and inline Nova actions
- `app/Nova/Filters/**` — Nova filter classes
- `app/Nova/Lenses/**` — Nova lens classes
- `app/Nova/Fields/**` — custom field implementations
- `routes/nova.php` — custom Nova routes (if present)
- `config/nova.php` — Nova configuration (auth guard, path, middleware)
- `resources/views/nova/**` — custom Nova Blade views

## Stack boundaries

- Nova resources: fields, rules, relatable, searchable, filterable config
- Nova actions: `handle()` method, action fields, queued execution
- Nova authorization: `authorizedToCreate`, `authorizedToUpdate`, policy gates
- Not in scope: customer-facing API routes without admin panel impact
- Not in scope: Eloquent model logic not surfaced via Nova resource

## Triggers

- Adding or modifying `fields()`, `actions()`, `filters()`, `lenses()` on a resource
- Changing field visibility rules (`showOnIndex`, `showOnDetail`, `hideWhenUpdating`)
- Adding or changing Nova action with side effects (email, job dispatch, model update)
- Modifying policy method (`viewAny`, `create`, `update`, `delete`) used by Nova
- Adding searchable/relatable configuration on BelongsTo/MorphTo fields
- Changing Nova config (middleware, auth guard, pagination)
