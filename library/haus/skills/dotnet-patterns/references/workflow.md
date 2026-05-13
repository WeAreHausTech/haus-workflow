# Workflow

## Implementation steps

1. Identify entry point: controller action, minimal API endpoint, or middleware
2. Trace request pipeline: middleware → controller/endpoint → service → repository → DB
3. For new endpoints: define DTO first, then validator, then service interface, then implementation
4. Register services in DI with correct lifetime — Scoped for EF DbContext dependencies
5. For EF changes: generate migration with descriptive name, review generated SQL
6. Validate `CancellationToken` threading through all async I/O paths
7. Confirm response codes: 200/201/400/404/422 returned consistently
8. Run tests: unit (mocked service), integration (TestServer or WebApplicationFactory)

## Commands

```bash
dotnet build                              # compile solution
dotnet run --project src/Api             # run API locally
dotnet test                              # run all tests
dotnet test --filter "Category=Unit"     # filter by category

# EF Core migrations
dotnet ef migrations add DescriptiveName --project src/Infrastructure --startup-project src/Api
dotnet ef database update --project src/Infrastructure --startup-project src/Api
dotnet ef migrations remove              # remove last uncommitted migration

dotnet ef dbcontext info                 # confirm connection string
yarn tsc --noEmit                         # if TypeScript client generated from OpenAPI
```

## Validation checklist

- [ ] Business logic lives in service layer, not controller
- [ ] DTOs validated before service call — FluentValidation or DataAnnotations
- [ ] All async methods accept and thread `CancellationToken`
- [ ] EF migrations reviewed for destructive column drops
- [ ] DI service lifetime matches dependency lifetimes (no Singleton → Scoped leak)
- [ ] API returns `ProblemDetails` format on error responses
- [ ] New config keys added to `appsettings.json` with documentation defaults
