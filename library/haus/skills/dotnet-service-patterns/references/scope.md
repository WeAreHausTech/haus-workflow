# Scope

## In-scope files and dirs

- `src/**/Services/**/*.cs` — service interfaces and implementations
- `src/**/Handlers/**`, `src/**/Commands/**`, `src/**/Queries/**` — CQRS handlers (MediatR)
- `src/**/Workers/**`, `src/**/HostedServices/**` — `IHostedService`, `BackgroundService` subclasses
- `src/**/Consumers/**`, `src/**/EventHandlers/**` — message/event consumers (MassTransit, RabbitMQ, Azure SB)
- `src/**/Domain/**`, `src/**/Aggregates/**` — domain models, aggregates, value objects
- `src/**/Adapters/**`, `src/**/Clients/**` — external service adapters, HTTP clients
- `src/**/Policies/**` — Polly retry/circuit-breaker policies
- `appsettings*.json` sections: `ServiceBus`, `Workers`, `Retry`

## Stack boundaries

- Background services: recurring timers, queue consumers, event-driven handlers
- gRPC: Protobuf service definitions, `GrpcService` implementations, streaming endpoints
- Domain orchestration: coordinating multiple repositories or external calls
- Not in scope: HTTP request-response controller logic (use dotnet-patterns)
- Not in scope: EF Core migration authoring (use dotnet-patterns)

## Triggers

- Adding or changing `IHostedService` / `BackgroundService` implementations
- Adding gRPC service method or modifying `.proto` contracts
- Changing retry/circuit-breaker policies on external calls
- Adding MediatR command/query handler or pipeline behavior
- Changing message consumer logic or dead-letter handling
- Modifying domain service orchestration across multiple aggregates
