---
name: vendure-plugin-patterns
description: Haus Vendure 3.x plugin development patterns. Use only when haus detects @vendure/core, @VendurePlugin, vendure config files, or @haus/vendure-* packages.
---

# Haus Vendure Plugin Patterns

Use this skill for Vendure plugin implementation, debugging, review, and refactoring.

## Rules

- Treat Vendure plugins as NestJS modules.
- Keep plugin boundaries explicit.
- Keep GraphQL schema extensions close to resolvers.
- Keep database entities, services, resolvers, and migrations organized by feature.
- Avoid client-specific behavior in shared plugins unless the plugin is explicitly client-specific.
- Add or update tests for business logic.
- Never read production env files.

## Expected workflow

1. Identify plugin boundary.
2. Identify affected API, service, entity, and migration files.
3. Make the smallest safe change.
4. Run the detected package manager checks.
5. State what was validated and what was not.