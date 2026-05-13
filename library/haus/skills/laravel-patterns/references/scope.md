# Scope

## In-scope files and dirs

- `routes/web.php`, `routes/api.php`, `routes/console.php` — route definitions
- `app/Http/Controllers/**` — request handling, form request delegation
- `app/Http/Requests/**` — FormRequest validation and authorization
- `app/Services/**`, `app/Actions/**` — business logic layer
- `app/Models/**` — Eloquent models, casts, relations, scopes
- `app/Jobs/**`, `app/Listeners/**`, `app/Events/**` — async side effects
- `app/Policies/**` — authorization gates
- `database/migrations/**` — schema migrations
- `database/factories/**`, `database/seeders/**` — test/dev data
- `config/*.php` — application configuration files
- `app/Providers/**` — service providers and DI bindings

## Stack boundaries

- Laravel framework: routing, middleware, FormRequest, Eloquent, queues, events
- Not in scope: Nova admin panel customization (use laravel-nova-patterns)
- Not in scope: Blade template styling without controller/service change
- Not in scope: frontend SPA components consuming Laravel API

## Triggers

- Adding or changing API/web routes and their controller actions
- Adding FormRequest with validation/authorization rules
- Adding Eloquent relation, scope, cast, or accessor/mutator
- Dispatching new jobs, events, or listeners
- Changing authorization policy
- Adding or modifying database migration
- Changing service container bindings in a service provider
