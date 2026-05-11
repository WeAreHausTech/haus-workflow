# CLI

`haus` command surface:

- `haus scan --json`
- `haus recommend --json`
- `haus setup-project --guided|--fast`
- `haus doctor` (includes hook contract check when `.claude/settings.json` exists)
- `haus doctor --hooks` (verify settings hooks only; exits non-zero if missing or drift)
- `haus apply --dry-run|--write`
- `haus undo` (remove `.claude/` and `.haus-ai/`; use `-y` / `--yes` to skip confirmation)
- `haus explain-context [--json] [--stats]`
- `haus explain-recommendation [--json]`
- `haus context --task "..." [--json]`
- `haus refresh`
- `haus update --check`
- `haus update`
- `haus memory ...`
- `haus sources ...`
- `haus plugin ...`
- `haus guard ...`
- `haus catalog-audit`
- `haus workspace init|scan`

## Apply vs update

- **`haus apply --write`** materializes `.claude/*`, `.haus-ai/selected-context.json`, and `.haus-ai/haus.lock.json`. Each lock row’s `hash` is a **sha256** digest over the **installed files** listed in `paths` (expanded when a path is a directory). `version` is the `@haus/ai` package version that performed the install. After writing `.claude/settings.json`, apply runs a **self-check** that it matches `plugin/hooks/hooks.json` (throws on drift).
- **`haus update`** backs up the existing lockfile, then **recomputes** each row’s `hash` from the current files on disk under `paths` (same `hashInstalledPaths` implementation in `src/update/hash-installed.ts` as apply). Other lock fields are preserved. Use this after editing installed assets or when refreshing integrity metadata.

## Explainability + context contracts

- `haus recommend --json` now includes:
  - `recommended[]` with `reasons[]`, `confidence`, `confidenceLevel`, and `score`
  - `skipped[]` with `skipReasons[]`
  - `selectedRules`, `skippedRules`, `estimatedTokenReductionPct`
- `haus explain-context --json` and `haus explain-recommendation --json` render directly from `.haus-ai/recommendation.json` (no extra scoring pass).
- `haus context --task "<task>" --json` returns task-scoped selected rules plus context minimization stats.
