# CLI

`haus` command surface:

- `haus scan --json`
- `haus recommend --json`
- `haus setup-project --guided|--fast`
- `haus doctor`
- `haus apply --dry-run|--write`
- `haus explain-context`
- `haus context --task "..."`
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

- **`haus apply --write`** materializes `.claude/*`, `.haus-ai/selected-context.json`, and `.haus-ai/haus.lock.json`. Each lock row’s `hash` is a **sha256** digest over the **installed files** listed in `paths` (expanded when a path is a directory). `version` is the `@haus/ai` package version that performed the install.
- **`haus update`** backs up the existing lockfile, then **recomputes** each row’s `hash` from the current files on disk under `paths` (same algorithm as apply). Other lock fields are preserved. Use this after editing installed assets or when refreshing integrity metadata.
