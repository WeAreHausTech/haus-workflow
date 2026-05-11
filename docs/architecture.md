# Architecture

`haus` acts as workflow control plane:

- scanner
- recommender
- apply writer
- memory handler
- update lockfile flow
- source policy adapters

Project outputs in `.claude/` and `.haus-ai/`.

## Hooks

`plugin/hooks/hooks.json` in the published package is canonical. The apply path copies its `hooks` tree into `.claude/settings.json` so CLI installs and plugin installs stay aligned on context injection, memory injection, and guard commands.

## Recommendations vs scan risks

`haus recommend` merges scanner `securityRisks` into output warnings and adjusts scores (see [docs/security.md](security.md)).
