# Commands

Source of truth: `src/cli.ts`.

## Core

- `haus init` — first-run setup; skips if `.haus-workflow/` already exists
- `haus setup-project [--guided|--fast|--json]`
- `haus scan [--json]`
- `haus recommend [--json]`
- `haus apply --dry-run|--write` — `--dry-run` shows per-file diffs without writing
- `haus doctor [--hooks]`
- `haus update [--check]`
- `haus undo [--yes]`
- `haus refresh`
- `haus catalog-audit`

## Explainability

- `haus explain-context [--task <task>] [--json] [--stats]`
- `haus explain-recommendation [--json]`
- `haus context [--task <task>] [--from-hook] [--json] [--verbose]` — `--verbose` shows score breakdown per rule

## Memory

- `haus memory status`
- `haus memory add <text>`
- `haus memory inject [--task <task>] [--from-hook]`
- `haus memory promote`

## Plugin and policy

- `haus plugin validate`
- `haus sources sync [--check]`
- `haus sources report`
- `haus sources audit`
- `haus guard file-access [--from-hook]`
- `haus guard bash [--from-hook]`

## Workspace

- `haus workspace init`
- `haus workspace scan`
