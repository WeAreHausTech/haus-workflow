# @haus/ai — Claude Code context

Claude Code plugin + CLI that scans repos, recommends context assets, and writes controlled outputs into `.claude/` and `.haus-ai/`.

## Build & test

```bash
yarn build          # compiles src/ → dist/ via tsup
yarn test           # runs tests/**/*.test.js with Node test runner
yarn dev <cmd>      # run CLI without building (tsx)
```

## Key structure

| Path | Purpose |
|---|---|
| `src/cli.ts` | CLI entry, command registration |
| `src/commands/` | One file per CLI command |
| `src/scanner/` | Repo detection, context-map generation |
| `src/recommender/` | Scoring + explainability |
| `src/claude/` | Generated file writer, hook contract checks |
| `src/update/` | Lockfile checks, hash refresh, backup |
| `src/memory/` | Local memory store + redaction |
| `src/security/` | Guardrails for sensitive paths + dangerous bash |
| `plugin/` | Shipped plugin metadata, hooks, skills |
| `library/catalog/manifest.json` | Catalog items used by recommender/apply |
| `tests/` | Node built-in test runner, no framework |
| `scripts/` | Audit + QA scripts (not part of the build) |

## Command flow

CLI → command module → core module (scanner/recommender/writer) → concise output (human or JSON)

Outputs written to: `.haus-ai/context-map.json`, `.haus-ai/recommendation.json`, `.haus-ai/haus.lock.json`, `.claude/*`

## Workflow rules

- Merge each PR to `main` before starting the next branch — no stacking
- Run `/compact` between tasks, `/clear` when pivoting to an unrelated topic
- `prepack` runs all audit scripts before publish — do not skip

## Do not read unless asked

`docs/` contains 16 reference files. Do not read them proactively — use them only when a specific doc is relevant to the task at hand.
