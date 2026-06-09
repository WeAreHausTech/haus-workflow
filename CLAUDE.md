@.claude/WORKFLOW.md
@.claude/workflow-config.md

# haus — Claude Code context

CLI that scans repos, recommends context assets, and writes controlled outputs into `.claude/` and `.haus-workflow/`.

## Build & test

```bash
yarn build          # compiles src/ → dist/ via tsup
yarn test           # runs tests/**/*.test.js with Node test runner
yarn dev <cmd>      # run CLI without building (tsx)
yarn verify         # full gate: typecheck + lint + build + test
```

## scripts/ convention

`scripts/` contains audit, QA, and release helpers written as native `.mjs` (node ESM) — run directly via `node` in CI (`.github/workflows/`) and locally, **not** during `prepack`. They use node built-ins only and are not compiled into `dist/`.

## Command flow

CLI → command module → core module (scanner/recommender/writer) → concise output (human or JSON)

Outputs written to: `.haus-workflow/context-map.json`, `.haus-workflow/recommendation.json`, `.haus-workflow/haus.lock.json`, `.claude/*`

Catalog content from [`haus-workflow-catalog`](https://github.com/WeAreHausTech/haus-workflow-catalog) (71 items; version in `library/catalog/manifest.json`). `apply`/`update` prune catalog items removed upstream when lock hash matches; user edits are kept. Validation rules: synced fixture `library/catalog/validation-rules.json` (skills require frontmatter `description:`).

## Workflow rules

- Merge each PR to `main` before starting the next branch — no stacking
- Run `/compact` between tasks, `/clear` when pivoting to an unrelated topic
- `prepack` runs `yarn build` before publish; audit/QA scripts run in CI, not prepack

## Do not read unless asked

`docs/` contains `architecture.md`, `cli.md`, `security.md`. Do not read them proactively — use them only when a specific doc is relevant to the task at hand.
