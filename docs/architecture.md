# Architecture

## Repo overview

`haus` is a Claude Code plugin/CLI workflow tool.
It scans repositories, recommends context assets, and writes controlled outputs in `./.claude` and `./.haus-workflow`.

## Repo structure

- `src/cli.ts`: command registration and Node engine check
- `src/commands/*`: command entrypoints
- `src/scanner/*`: repo detection and context-map generation
- `src/recommender/*`: recommendation scoring + explainability data
- `src/claude/*`: generated file writer + hook contract checks
- `src/update/*`: lockfile checks, hash refresh, backup, diff summary
- `src/memory/*`: local memory store and redaction
- `src/security/*`: guardrails for sensitive paths and dangerous bash
- `src/catalog/*`: catalog manifest loader and allowed-stack validation
- `src/library/*`: catalog/library audit logic
- `src/sources/*`: external source sync, audit, and report
- `src/curation/*`: unsupported-stack token detection for source decisions
- `src/utils/*`: shared utilities (`logger.ts`, `fs.ts`, `paths.ts`, `audit-checks.ts`, `diff.ts`, `exec.ts`, `prompts.ts`, `versions.ts`)
- `src/types/*`: local ambient type declarations
- `plugin/*`: shipped plugin metadata, hooks, skills, and subagents
- `library/catalog/manifest.json`: catalog items used by recommender/apply
- `library/curation/`: idea-layer source decisions
- `library/curated/`: artifact-layer curated external content

## Command flow

1. CLI parses command.
2. Command module loads inputs from repo + `.haus-workflow`.
3. Core module runs (scanner/recommender/writer/update/etc).
4. Command emits concise output (human or JSON).

## Scanner flow

1. collect safe files with `fast-glob`
2. filter sensitive paths
3. infer roles/stacks/package manager/dependencies
4. write:
   - `./.haus-workflow/context-map.json`
   - `./.haus-workflow/dependency-map.json`
   - `./.haus-workflow/scan-hashes.json`
   - `./.haus-workflow/repo-summary.md`

## Recommender flow

1. load catalog manifest items
2. compute score from roles/stacks/goals/requiresAny/signals
3. apply unsupported-stack and policy penalties
4. emit recommended + skipped rows with reasons and confidence
5. write `./.haus-workflow/recommendation.json`

## Apply / generator flow

1. read recommendation file
2. write canonical `./.claude/*` command/rule/settings files
3. copy selected catalog assets into `./.claude/skills` or `./.claude/agents`
4. write:
   - `./.haus-workflow/selected-context.json`
   - `./.haus-workflow/haus.lock.json`
5. print overwrite summary for changed generated files

## Update / lockfile flow

1. `update --check` validates lock presence + version fields
2. `update` backs up lockfile to `./.haus-workflow/backups`
3. recomputes per-item hashes from lockfile `paths`
4. prints unified lock diff + summary

## Memory flow

1. ensure local memory files under `./.haus-workflow/memory`
2. append redacted notes (`memory add`)
3. inject compact redacted memory text (`memory inject`)
4. keep promotion manual (`memory promote`)

## Plugin / skills / hooks flow

1. plugin entrypoint: `plugin/.claude-plugin/plugin.json`
2. hook source of truth: `plugin/hooks/hooks.json`
3. `apply --write` writes `./.claude/settings.json` from hook source
4. `doctor --hooks` verifies project settings vs canonical hook config
