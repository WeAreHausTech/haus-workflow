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

`plugin/hooks/hooks.json` in the published package is canonical. Apply loads it in strict mode (throws if missing unless `HAUS_HOOKS_FALLBACK=1` for dev), writes `.claude/settings.json`, and runs a post-write self-check. `haus doctor` / `haus doctor --hooks` compare the project file to the contract to catch drift.

## Recommendations vs scan risks

`haus recommend` merges scanner `securityRisks` into output warnings and adjusts scores (see [docs/security.md](security.md)).
