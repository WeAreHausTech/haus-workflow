# Architecture

## Repo overview

`@haus/ai` is a Claude Code plugin/CLI workflow tool.
It scans repositories, recommends context assets, and writes controlled outputs in `./.claude` and `./.haus-ai`.

## Repo structure

- `src/cli.ts`: command registration and Node engine check
- `src/commands/*`: command entrypoints
- `src/scanner/*`: repo detection and context-map generation
- `src/recommender/*`: recommendation scoring + explainability data
- `src/claude/*`: generated file writer + hook contract checks
- `src/update/*`: lockfile checks, hash refresh, backup, diff summary
- `src/memory/*`: local memory store and redaction
- `src/security/*`: guardrails for sensitive paths and dangerous bash
- `plugin/*`: shipped plugin metadata, hooks, and skills
- `library/catalog/manifest.json`: catalog items used by recommender/apply

## Command flow

1. CLI parses command.
2. Command module loads inputs from repo + `.haus-ai`.
3. Core module runs (scanner/recommender/writer/update/etc).
4. Command emits concise output (human or JSON).

## Scanner flow

1. collect safe files with `fast-glob`
2. filter sensitive paths
3. infer roles/stacks/package manager/dependencies
4. write:
   - `./.haus-ai/context-map.json`
   - `./.haus-ai/dependency-map.json`
   - `./.haus-ai/scan-hashes.json`
   - `./.haus-ai/repo-summary.md`

## Recommender flow

1. load catalog manifest items
2. compute score from roles/stacks/goals/requiresAny/signals
3. apply unsupported-stack and policy penalties
4. emit recommended + skipped rows with reasons and confidence
5. write `./.haus-ai/recommendation.json`

## Apply / generator flow

1. read recommendation file
2. write canonical `./.claude/*` command/rule/settings files
3. copy selected catalog assets into `./.claude/skills` or `./.claude/agents`
4. write:
   - `./.haus-ai/selected-context.json`
   - `./.haus-ai/haus.lock.json`
5. print overwrite summary for changed generated files

## Update / lockfile flow

1. `update --check` validates lock presence + version fields
2. `update` backs up lockfile to `./.haus-ai/backups`
3. recomputes per-item hashes from lockfile `paths`
4. prints unified lock diff + summary

## Memory flow

1. ensure local memory files under `./.haus-ai/memory`
2. append redacted notes (`memory add`)
3. inject compact redacted memory text (`memory inject`)
4. keep promotion manual (`memory promote`)

## Plugin / skills / hooks flow

1. plugin entrypoint: `plugin/.claude-plugin/plugin.json`
2. hook source of truth: `plugin/hooks/hooks.json`
3. `apply --write` writes `./.claude/settings.json` from hook source
4. `doctor --hooks` verifies project settings vs canonical hook config
