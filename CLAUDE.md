# haus — Claude Code context

Claude Code plugin + CLI that scans repos, recommends context assets, and writes controlled outputs into `.claude/` and `.haus-workflow/`.

## Build & test

```bash
yarn build          # compiles src/ → dist/ via tsup
yarn test           # runs tests/**/*.test.js with Node test runner
yarn dev <cmd>      # run CLI without building (tsx)
yarn verify         # full gate: typecheck + lint + build + test + prepack
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
| `src/utils/` | Shared utilities: `logger.ts`, `fs.ts`, `paths.ts`, `audit-checks.ts` |
| `src/library/` | Catalog loader + audit logic |
| `src/catalog/` | Catalog manifest types and loader |
| `src/sources/` | External source sync, audit, and report |
| `src/curation/` | Unsupported-stack token detection for source-decision validation |
| `src/types/` | Local type declarations (e.g. `diff.d.ts`) |
| `plugin/` | Shipped plugin metadata, hooks, skills |
| `library/catalog/manifest.json` | Catalog items used by recommender/apply |
| `tests/` | Node built-in test runner, no framework (see `tests/README.md`) |
| `scripts/` | Audit + QA scripts (not part of the build) |

## src/ module boundaries

- `src/commands/` — thin CLI handlers only; delegate to core modules, never import from each other
- `src/utils/` — pure utilities with no dependencies on scanner/recommender/claude modules
- `src/scanner/` → may use `src/utils/` and `src/catalog/`
- `src/recommender/` → may use `src/scanner/`, `src/utils/`, `src/catalog/`
- `src/claude/` → may use `src/utils/`, `src/update/`, `src/recommender/`
- `src/security/` → may use `src/utils/` only
- All `console.*` calls are banned in `src/` — use `log`/`warn`/`error` from `src/utils/logger.ts`

## scripts/ convention

`scripts/` contains audit and QA scripts run via `tsx` during `prepack`. They are **not** compiled into `dist/`. Scripts may import from `src/` using relative paths (`../src/...`). They are typechecked separately via `tsconfig.scripts.json` (`yarn typecheck:scripts`).

## Command flow

CLI → command module → core module (scanner/recommender/writer) → concise output (human or JSON)

Outputs written to: `.haus-workflow/context-map.json`, `.haus-workflow/recommendation.json`, `.haus-workflow/haus.lock.json`, `.claude/*`

## Workflow rules

- Merge each PR to `main` before starting the next branch — no stacking
- Run `/compact` between tasks, `/clear` when pivoting to an unrelated topic
- `prepack` runs all audit scripts before publish — do not skip

## Do not read unless asked

`docs/` contains 18 reference files. Do not read them proactively — use them only when a specific doc is relevant to the task at hand.
