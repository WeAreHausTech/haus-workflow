# Codebase

## Top-level directories

| Path               | Purpose                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `src/`             | TypeScript source; compiled to `dist/` via esbuild                                                |
| `dist/`            | Compiled output (generated — do not hand-edit)                                                    |
| `tests/`           | Unit and integration tests (Node test runner)                                                     |
| `tests/fixtures/`  | Synthetic repo fixtures for scanner/recommender tests                                             |
| `tests/helpers/`   | Shared test utilities                                                                             |
| `library/global/`  | Shipped skills, agents, and hook templates (packed into npm)                                      |
| `library/catalog/` | Bundled catalog manifest + `validation-rules.json` fixture (fallback when remote cache is absent) |
| `scripts/`         | ESM audit/QA/release helpers — run via `node`; not compiled, not called by `prepack`              |
| `docs/`            | Agent-operable documentation index                                                                |
| `.haus-workflow/`  | Runtime outputs (context-map, recommendation, lock — gitignored)                                  |
| `.claude/`         | haus-managed project hooks, settings, workflow docs                                               |

## Entry points and wiring

| File                               | Role                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `src/cli.ts`                       | CLI entry point — registers all commands, enforces Node engine version                 |
| `src/types.ts`                     | Shared TypeScript types across the codebase                                            |
| `src/commands/`                    | One thin handler per command; delegates to core modules                                |
| `src/claude/load-hooks.ts`         | `CANONICAL_HOOKS` — source of truth for hook config written to `.claude/settings.json` |
| `src/claude/write-claude-files.ts` | Central writer — orchestrates all `.claude/` file writes                               |
| `library/catalog/manifest.json`    | Bundled catalog; version pin; fallback source for scanner dependency signals           |

## Module inventory

All `src/` modules:

| Module        | Path               | Purpose                                                                                                                                                                |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scanner       | `src/scanner/`     | Detect stacks, roles, package manager, dependencies via `detection-registry.ts`; write context-map and scan artefacts                                                  |
| Recommender   | `src/recommender/` | Binary eligibility (policy gates + match signals); produce `recommendation.json`; merge `deep-context.json` signals                                                    |
| Claude writer | `src/claude/`      | Write `.claude/` files; manage templates; verify hooks contract; derive `workflow-config.md` fields; handle superpowers install                                        |
| Update        | `src/update/`      | Lockfile checks, hash refresh, backup, diff summary                                                                                                                    |
| Install       | `src/install/`     | Global `~/.claude/` seed/teardown; settings merge (hooks, deny/allow); orphan cleanup; companion tools; `scaffold.ts` copies `config`-type items into the project root |
| Security      | `src/security/`    | Guard dangerous bash tokens and sensitive file paths; derive `permissions.deny` list                                                                                   |
| Catalog       | `src/catalog/`     | Load and validate catalog manifest; apply validation rules from `validation-rules.json`                                                                                |
| Utils         | `src/utils/`       | Shared pure utilities: `logger`, `fs`, `paths`, `audit-checks`, `diff`, `exec`, `prompts`, `versions`                                                                  |
| Types         | `src/types/`       | Ambient type declarations                                                                                                                                              |

Key files inside modules:

| File                                   | Role                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/scanner/detection-registry.ts`    | Data-driven `DetectionRule[]`; dependency signals cross-reference catalog manifest                                           |
| `src/recommender/policies.ts`          | Hard include/exclude gates — bugs here silently drop or leak context assets                                                  |
| `src/recommender/recommend.ts`         | Main recommendation logic; merges deep-context signals                                                                       |
| `src/claude/managed-template.ts`       | Template tamper detection — hash-based; bugs block catalog updates for all users                                             |
| `src/claude/write-workflow.ts`         | Writes managed workflow blocks; tamper-detects before overwrite                                                              |
| `src/claude/merge-project-settings.ts` | Reconciles haus hooks into project `.claude/settings.json`                                                                   |
| `src/install/settings-merge.ts`        | Reconciles haus hooks and permissions into `~/.claude/settings.json`; tracks added entries under `_haus` for clean uninstall |
| `src/commands/setup-core.ts`           | Shared scan→recommend→apply pipeline used by `init` and `setup-project`                                                      |

## Where to change what

| Task                                            | Primary path                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Add/change a CLI command                        | `src/commands/<cmd>.ts` + register in `src/cli.ts`                             |
| Change stack/role detection                     | `src/scanner/detection-registry.ts`                                            |
| Change recommendation policy                    | `src/recommender/policies.ts`                                                  |
| Change which files haus writes to `.claude/`    | `src/claude/write-claude-files.ts`                                             |
| Change `haus scaffold` config-file distribution | `src/install/scaffold.ts`, `src/commands/scaffold.ts`                          |
| Change hook configuration                       | `src/claude/load-hooks.ts` (`CANONICAL_HOOKS`)                                 |
| Change global install behaviour                 | `src/install/apply.ts`, `src/install/settings-merge.ts`                        |
| Add/change a security guard rule                | `src/security/`                                                                |
| Add/change catalog validation rules             | Sync from `haus-workflow-catalog`; see `library/catalog/validation-rules.json` |
| Add a QA or release script                      | `scripts/*.mjs`                                                                |
| Update bundled global skills/agents             | `library/global/`                                                              |

## Tests

| Location          | What                                               |
| ----------------- | -------------------------------------------------- |
| `tests/*.test.js` | Unit and integration tests (Node native runner)    |
| `tests/fixtures/` | Synthetic repo fixtures for characterisation tests |
| `tests/helpers/`  | Shared test helpers                                |

Test tiers: `yarn test:fast` (pre-push, unit only) · `yarn test` (full) · `yarn test:coverage` (CI with coverage). See [dev.md](dev.md) for details.
