# Scope

## In-scope files and dirs

- `turbo.json` — pipeline task definitions, `dependsOn`, `inputs`, `outputs`, `cache` flags
- `package.json` (root) — workspace definitions (`workspaces` field), root scripts
- `apps/**/package.json` — per-app scripts consumed by Turbo pipeline tasks
- `packages/**/package.json` — per-package scripts and internal dependency declarations
- `.turbo/` — local Turbo cache (gitignored)
- `turbo.config.ts` (if present) — programmatic config (Turbo 2+)

## Stack boundaries

- Turborepo: task graph, remote caching, `--filter`, `--affected` (Turbo 2+)
- Pipeline: `build`, `test`, `lint`, `dev`, `typecheck` task coordination
- Not in scope: app feature logic inside one package with no pipeline impact
- Not in scope: Nx target config (use nx21-monorepo-patterns)

## Triggers

- Adding a new workspace package under `apps/` or `packages/`
- Adding or renaming a script in any `package.json` consumed by `turbo.json` pipeline
- Adding a `dependsOn` relationship between tasks
- Changing `inputs` or `outputs` for a cached task
- Enabling remote cache (`--token`, `--team` in CI)
- Adding `turbo run` to CI pipeline or changing existing CI pipeline commands
