@.claude/WORKFLOW.md
@.claude/workflow-config.md

# haus — Claude Code context

CLI that scans repos, recommends context assets, and writes controlled outputs into `.claude/` and `.haus-workflow/`.

## Build & test

```bash
yarn build          # compiles src/ → dist/ via esbuild
yarn test           # runs tests/**/*.test.js with Node test runner
yarn dev <cmd>      # run CLI without building (tsx)
yarn verify         # full gate: typecheck + lint + build + test
```

## scripts/ convention

`scripts/` contains audit, QA, and release helpers written as native `.mjs` (node ESM) — run directly via `node` in CI (`.github/workflows/`) and locally, **not** during `prepack`. They use node built-ins only and are not compiled into `dist/`.

## Command flow

CLI → command module → core module (scanner/recommender/writer) → concise output (human or JSON)

Outputs written to: `.haus-workflow/context-map.json`, `.haus-workflow/recommendation.json`, `.haus-workflow/haus.lock.json`, `.claude/*`

Catalog content from [`haus-workflow-catalog`](https://github.com/WeAreHausTech/haus-workflow-catalog) (94 items: 73 skills, 15 agents, 4 templates, 2 configs; version in `library/catalog/manifest.json`). `apply`/`update` prune catalog items removed upstream when lock hash matches; user edits are kept. Validation rules: synced fixture `library/catalog/validation-rules.json` (skills require frontmatter `description:`).

## Key conventions

- Merge each PR to `main` before starting the next branch — no stacking
- Run `/compact` between tasks, `/clear` when pivoting to an unrelated topic
- `prepack` runs `yarn build` before publish; audit/QA scripts run in CI, not prepack
- `src/commands/` — thin handlers only; never import across command files
- Highest-stakes: tamper detection in `src/claude/write-workflow.ts` / `src/claude/managed-template.ts`; recommender policy gates in `src/recommender/policies.ts` — bugs here silently break downstream users
- `scripts/` — node ESM helpers, CI-only or on-demand; never called by `prepack`
- **Docs are an index:** use path references in `docs/`; read source for implementation detail
- **Keep docs in sync:** after setup, commands, env, deploy, or integration changes, run the **writing-documentation** skill in this repo and commit doc updates with the code change

## Before opening a PR

- [ ] `yarn verify` (typecheck + lint + build + test)
- [ ] Run the **writing-documentation** skill when setup, commands, env, deploy, or integration changed (or N/A)
- [ ] Docs reflect this change or explicitly N/A
- [ ] `fix:` commits must include a regression test (see CI `fix-needs-test` gate)

## Docs

[docs/SUMMARY.md](docs/SUMMARY.md)

> `docs/` contains topic files for architecture, codebase, CLI, dev workflow, security, and runbook. Do not read proactively — route via `docs/SUMMARY.md` or load only the file relevant to the task at hand.
