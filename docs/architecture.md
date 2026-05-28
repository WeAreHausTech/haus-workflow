# Architecture

## Overview

`haus` is a standalone CLI that scans repositories, recommends context assets, and writes controlled outputs into `.claude/` and `.haus-workflow/`.

Core flow: **scan → recommend → apply**

---

## Repo structure

| Path | Purpose |
|---|---|
| `src/cli.ts` | CLI entry, command registration, Node engine check |
| `src/commands/` | One file per CLI command (thin handlers only) |
| `src/scanner/` | Repo detection and context-map generation |
| `src/recommender/` | Recommendation scoring and explainability |
| `src/claude/` | Generated file writer and hook contract checks |
| `src/update/` | Lockfile checks, hash refresh, backup, diff summary |
| `src/memory/` | Local memory store and redaction |
| `src/security/` | Guardrails for sensitive paths and dangerous bash |
| `src/catalog/` | Catalog manifest loader and allowed-stack validation |
| `src/library/` | Catalog/library audit logic |
| `src/sources/` | External source sync, audit, and report |
| `src/curation/` | Unsupported-stack token detection for source decisions |
| `src/utils/` | Shared utilities: `logger.ts`, `fs.ts`, `paths.ts`, `audit-checks.ts`, `diff.ts`, `exec.ts`, `prompts.ts`, `versions.ts` |
| `src/types/` | Local ambient type declarations |
| `library/global/` | Shipped skills, agents, and hook templates |

---

## Module boundaries

- `src/commands/` — thin CLI handlers only; delegate to core modules, never import from each other
- `src/utils/` — pure utilities with no dependencies on scanner/recommender/claude modules
- `src/scanner/` → may use `src/utils/` and `src/catalog/`
- `src/recommender/` → may use `src/scanner/`, `src/utils/`, `src/catalog/`
- `src/claude/` → may use `src/utils/`, `src/update/`, `src/recommender/`
- `src/security/` → may use `src/utils/` only

---

## Command flow

1. CLI parses command.
2. Command module loads inputs from repo and `.haus-workflow/`.
3. Core module runs (scanner / recommender / writer / update / etc.).
4. Command emits concise output (human or JSON).

---

## Scanner flow

1. Collect safe files with `fast-glob`.
2. Filter sensitive paths.
3. Infer roles, stacks, package manager, and dependencies.
4. Write:
   - `.haus-workflow/context-map.json`
   - `.haus-workflow/dependency-map.json`
   - `.haus-workflow/scan-hashes.json`
   - `.haus-workflow/repo-summary.md`

---

## Recommender flow

1. Load catalog manifest items (fetched remotely via `haus update`).
2. Compute score from roles, stacks, goals, `requiresAny`, and signals.
3. Apply unsupported-stack and policy penalties.
4. Emit recommended and skipped rows with reasons and confidence.
5. Write `.haus-workflow/recommendation.json`.

---

## Apply / generator flow

1. Read recommendation file.
2. Write canonical `.claude/*` command, rule, and settings files.
3. Copy selected catalog assets into `.claude/skills` or `.claude/agents`.
4. Write:
   - `.haus-workflow/selected-context.json`
   - `.haus-workflow/haus.lock.json`
5. Print overwrite summary for changed generated files.
6. Self-check that written `.claude/settings.json` matches canonical hook config.

---

## Update / lockfile flow

1. `update --check` validates lock presence and version fields.
2. `update` backs up lockfile to `.haus-workflow/backups/`.
3. Recomputes per-item hashes from lockfile `paths`.
4. Prints unified lock diff and summary.

The catalog is maintained in a separate repository and fetched by `haus update`.

---

## Memory flow

1. Ensure local memory files under `.haus-workflow/memory/`.
2. Append redacted notes (`memory add`).
3. Inject compact redacted memory text (`memory inject`).
4. Keep promotion manual (`memory promote`).

---

## Global install flow

1. `haus install` seeds `~/.claude/` with HAUS-MANAGED skills, agents, and hooks.
2. Hook source of truth: `src/claude/load-hooks.ts` (`CANONICAL_HOOKS`).
3. `apply --write` writes `.claude/settings.json` from canonical hook config.
4. `doctor --hooks` verifies project settings against canonical hook contract.

---

## Output files

| File | Written by |
|---|---|
| `.haus-workflow/context-map.json` | `scan` |
| `.haus-workflow/dependency-map.json` | `scan` |
| `.haus-workflow/scan-hashes.json` | `scan` |
| `.haus-workflow/repo-summary.md` | `scan` |
| `.haus-workflow/recommendation.json` | `recommend` |
| `.haus-workflow/selected-context.json` | `apply` |
| `.haus-workflow/haus.lock.json` | `apply` |
| `.claude/*` | `apply` |
