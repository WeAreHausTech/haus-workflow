# Architecture

## Overview

`haus` is a standalone CLI that scans repositories, recommends context assets, and writes controlled outputs into `.claude/` and `.haus-workflow/`.

Core flow: **scan → recommend → apply**

---

## Repo structure

| Path               | Purpose                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `src/cli.ts`       | CLI entry, command registration, Node engine check                                                                       |
| `src/commands/`    | One file per CLI command (thin handlers only)                                                                            |
| `src/scanner/`     | Repo detection and context-map generation                                                                                |
| `src/recommender/` | Binary eligibility recommendation and explainability                                                                     |
| `src/claude/`      | Generated file writer and hook contract checks                                                                           |
| `src/update/`      | Lockfile checks, hash refresh, backup, diff summary                                                                      |
| `src/install/`     | Global `~/.claude/` install/uninstall: file copy + manifest, settings merge (hooks, deny/allow), postinstall gate        |
| `src/security/`    | Guardrails for sensitive paths and dangerous bash; derives `permissions.deny` from the same lists                        |
| `src/catalog/`     | Catalog manifest loader and validation (rules from the synced `validation-rules.json` fixture)                           |
| `src/utils/`       | Shared utilities: `logger.ts`, `fs.ts`, `paths.ts`, `audit-checks.ts`, `diff.ts`, `exec.ts`, `prompts.ts`, `versions.ts` |
| `src/types/`       | Local ambient type declarations                                                                                          |
| `library/global/`  | Shipped skills, agents, and hook templates                                                                               |
| `library/catalog/` | Bundled manifest + `validation-rules.json` fixture (synced from catalog; fallback when remote cache is absent)           |

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
3. Infer roles, stacks, package manager, and dependencies via the data-driven
   `detection-registry` (a typed `DetectionRule[]`), with dependency signals derivable
   from the catalog manifest so scanner and catalog can't drift.
4. Classify `detectionStatus` (`supported` | `partial` | `unknown`) and record
   `unsupportedSignals` from presence-only markers (e.g. `requirements.txt`, `go.mod`).
5. Write:
   - `.haus-workflow/context-map.json`
   - `.haus-workflow/dependency-map.json`
   - `.haus-workflow/scan-hashes.json`
   - `.haus-workflow/repo-summary.md`

---

## Recommender flow

Eligibility is **binary** — no numeric scores or confidence. Policy gates are hard
include/exclude; positive match signals make an item eligible.

1. Load catalog manifest items (fetched remotely via `haus update`).
2. Apply policy gates (unsupported stack, curated approval/risk, source trust,
   sensitive content, required role, `requiresAny`) — a failed gate skips the item.
3. Collect positive match signals (catalog default, role, stack, goal, package
   manager, config signal, changed file). If `.haus-workflow/deep-context.json`
   exists, its LLM-discovered roles/stacks/patterns are merged in (tagged `deep:…`).
4. Recommend the item iff it is a catalog default OR has ≥1 match signal; emit
   recommended and skipped rows with reasons.
5. Write `.haus-workflow/recommendation.json`.

The `deep-context.json` file is written by the `writing-documentation` skill's deep
scan; a second `recommend` pass picks up skills the shallow scanner missed.

---

## Apply / generator flow

1. Read recommendation file (optionally filtered by `--select`).
2. Write canonical `.claude/*` command, rule, and settings files.
3. Copy selected catalog assets into `.claude/{skills,agents,commands,templates}`.
4. **Stale cleanup:** compare previous `haus.lock.json` to the current catalog manifest.
   Items removed upstream are deleted when on-disk content matches the lock hash;
   user-modified copies are kept. Items merely deselected via `--select` but still in
   the catalog are not removed.
5. Write:
   - `.haus-workflow/selected-context.json`
   - `.haus-workflow/haus.lock.json`
6. Print overwrite summary for changed generated files.
7. Self-check that written `.claude/settings.json` matches canonical hook config.

---

## Update / lockfile flow

1. `update --check` validates lock presence and version fields.
2. `update` backs up lockfile to `.haus-workflow/backups/`.
3. Fetches latest catalog manifest into `~/.claude/haus/catalog-cache/`, caching **full skill
   directories** (not only `SKILL.md`) via a single recursive GitHub tree listing per sync.
   Superpowers support files under `skills/superpowers/shared/` are cached alongside items.
4. Refreshes global install (`haus install` — includes orphan cleanup for `~/.claude/`).
5. Re-applies project files via `writeClaudeFiles` (includes stale-item cleanup). Curated
   superpowers skills install the full cached skill tree, copy `skills/superpowers/shared/`
   to `.claude/skills/shared/`, and rewrite `skills/shared/` prose paths in installed
   markdown only.
6. Recomputes per-item hashes from lockfile `paths`.
7. Prints unified lock diff and summary.

The catalog is maintained in a separate repository ([`haus-workflow-catalog`](https://github.com/WeAreHausTech/haus-workflow-catalog)). `haus update` resolves the latest release tag by default (override with `HAUS_CATALOG_REF`; fallback `main` when no tag can be resolved).

---

## Memory

haus ships no memory store. Cross-session learnings use Claude Code's native
`MEMORY.md`.

---

## Global install flow

1. `haus install` seeds `~/.claude/` with HAUS-MANAGED skills and global slash commands
   (`~/.claude/commands/*.md`), tracked in `~/.claude/haus/install-manifest.json`.
2. `settings-merge` merges hooks plus `permissions.deny` and scoped `permissions.allow`
   into `~/.claude/settings.json`, tracking haus-added entries under `_haus` so
   `uninstall` strips exactly those (leaving user entries intact).
3. A **global** `npm i -g` auto-runs this via `scripts/postinstall.mjs` (global-only,
   CI-skipping, non-fatal, idempotent; `HAUS_NO_POSTINSTALL=1` opts out).
4. Hook source of truth: `src/claude/load-hooks.ts` (`CANONICAL_HOOKS`); `apply --write`
   writes project `.claude/settings.json` from it and self-checks for drift.
5. `doctor --hooks` verifies project settings against the canonical hook contract.

---

## Output files

| File                                   | Written by  |
| -------------------------------------- | ----------- |
| `.haus-workflow/context-map.json`      | `scan`      |
| `.haus-workflow/dependency-map.json`   | `scan`      |
| `.haus-workflow/scan-hashes.json`      | `scan`      |
| `.haus-workflow/repo-summary.md`       | `scan`      |
| `.haus-workflow/recommendation.json`   | `recommend` |
| `.haus-workflow/selected-context.json` | `apply`     |
| `.haus-workflow/haus.lock.json`        | `apply`     |
| `.claude/*`                            | `apply`     |
