@.claude/WORKFLOW.md
@.claude/workflow-config.md

# haus — Claude Code context

CLI that scans repos, recommends context assets, and writes controlled outputs into `.claude/` and `.haus-workflow/`.

## Build & test

```bash
yarn build          # compiles src/ → dist/ via tsup
yarn test           # runs tests/**/*.test.js with Node test runner
yarn dev <cmd>      # run CLI without building (tsx)
yarn verify         # full gate: typecheck + lint + build + test + prepack
```

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

`docs/` contains `architecture.md`, `cli.md`, `security.md`. Do not read them proactively — use them only when a specific doc is relevant to the task at hand.
