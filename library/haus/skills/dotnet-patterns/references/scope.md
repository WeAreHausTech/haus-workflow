# Scope

## In-scope files and dirs

- `Program.cs`, `Startup.cs` — app bootstrap, middleware pipeline, DI registration
- `src/**/Controllers/**`, `src/**/Endpoints/**` — API controllers, minimal API endpoints
- `src/**/Services/**`, `src/**/Application/**` — service layer, application handlers
- `src/**/Repositories/**`, `src/**/Infrastructure/**` — data access, EF Core repos
- `src/**/Models/**`, `src/**/Entities/**`, `src/**/DTOs/**` — domain models and data contracts
- `src/**/Validators/**` — FluentValidation validators
- `appsettings*.json`, `appsettings.{Environment}.json` — runtime configuration
- `*.csproj`, `*.sln` — project/solution files
- `src/**/Migrations/**` — EF Core migrations

## Stack boundaries

- ASP.NET Core: middleware, controllers, minimal APIs, model binding, filters
- EF Core: migrations, DbContext, query optimization, owned entities
- Dependency Injection: service lifetime (Singleton/Scoped/Transient), factory registration
- Not in scope: pure frontend/SPA code not coupled to .NET runtime
- Not in scope: non-.NET background service logic (covered by dotnet-service-patterns)

## Triggers

- Adding or changing API endpoints (controller action, minimal API route)
- Changing DI registrations in `Program.cs` or module registration
- Adding EF Core migration or changing DbContext configuration
- Changing DTO contracts or adding FluentValidation validators
- Modifying middleware order or adding new middleware
- Adding or changing `appsettings` keys consumed by services
