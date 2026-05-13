# Workflow

## Implementation steps

1. Identify service boundary: hosted service, domain service, gRPC handler, or event consumer
2. For background services: confirm execution cadence, cancellation token handling, and restart behavior
3. For gRPC: check `.proto` file first — generate stubs before implementing `override` methods
4. For domain services: keep orchestration pure (no direct HTTP/DB); inject repositories and adapters
5. Add Polly retry policy for all external HTTP/queue calls — configure backoff and circuit breaker
6. Ensure idempotency on side-effecting operations (message consumers, webhooks)
7. Add structured logging at service entry and on error paths — include correlation/trace IDs
8. Write unit tests with mocked dependencies; integration test with hosted service TestHost

## Commands

```bash
dotnet build
dotnet test --filter "Category=Service"

# gRPC code generation (after .proto change)
dotnet build   # triggers Grpc.Tools codegen on build

# MassTransit / messaging
dotnet run     # start consumer locally against dev broker

# Check hosted service registration
grep -r "AddHostedService\|IHostedService" src/ --include="*.cs"

# Polly policy check
grep -r "AddPolicyHandler\|ResiliencePipeline" src/ --include="*.cs"
```

## Validation checklist

- [ ] `BackgroundService.ExecuteAsync` handles `CancellationToken.IsCancellationRequested`
- [ ] All external calls wrapped in Polly retry policy with finite max retries
- [ ] Message consumers are idempotent — duplicate delivery does not corrupt state
- [ ] Domain service does not depend on `HttpContext` or transport concerns
- [ ] gRPC `.proto` version bumped and stubs regenerated before implementation
- [ ] Structured logs include operation name, entity ID, and exception details
- [ ] Service registered with correct DI lifetime in `Program.cs`
