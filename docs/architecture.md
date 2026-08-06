# Architecture

## Overview

`haus` is a standalone CLI that scans repositories, recommends context assets, and writes controlled outputs into `.claude/` and `.haus-workflow/`.

Core flow: **scan → recommend → apply**

---

## Repo structure

| Path               | Purpose                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli.ts`       | CLI entry, command registration, Node engine check                                                                                      |
| `src/commands/`    | One file per CLI command (thin handlers only)                                                                                           |
| `src/scanner/`     | Repo detection and context-map generation                                                                                               |
| `src/recommender/` | Binary eligibility recommendation and explainability                                                                                    |
| `src/claude/`      | Generated file writer and hook contract checks                                                                                          |
| `src/update/`      | Lockfile checks, hash refresh, backup, diff summary                                                                                     |
| `src/install/`     | Global `~/.claude/` install/uninstall: file copy + manifest, settings merge (hooks, deny/allow), postinstall gate                       |
| `src/security/`    | Guardrails for sensitive paths and dangerous bash; derives `permissions.deny` from the same lists                                       |
| `src/catalog/`     | Catalog manifest loader and validation (rules from the synced `validation-rules.json` fixture)                                          |
| `src/utils/`       | Shared utilities: `logger.ts`, `fs.ts`, `paths.ts`, `audit-checks.ts`, `diff.ts`, `exec.ts`, `prompts.ts`, `versions.ts`, `git-root.ts` |
| `src/workspace/`   | Multi-repo workspace core: `members.ts` (bridge), `worktree/` (materialization), `link-context/` (cross-repo copy)                      |
| `src/types/`       | Local ambient type declarations                                                                                                         |
| `library/global/`  | Shipped skills, agents, and hook templates                                                                                              |
| `library/catalog/` | Bundled manifest + `validation-rules.json` fixture (synced from catalog; fallback when remote cache is absent)                          |

---

## Module boundaries

- `src/commands/` — thin CLI handlers only; delegate to core modules, never import from each other
- `src/utils/` — pure utilities with no dependencies on scanner/recommender/claude modules
- `src/scanner/` → may use `src/utils/` and `src/catalog/`
- `src/recommender/` → may use `src/scanner/`, `src/utils/`, `src/catalog/`
- `src/claude/` → may use `src/utils/`, `src/update/`, `src/recommender/`
- `src/security/` → may use `src/utils/` only
- `src/workspace/` → may use `src/utils/` (esp. `git-root.ts`), `src/commands/workspace/config.ts` (shared YAML parser — an exception to the thin-handler rule, since `config.ts` already functions as a shared parser consumed by sibling command files, not a command handler itself)

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

The catalog is maintained in a separate repository ([`haus-workflow-catalog`](https://github.com/WeAreHausTech/haus-workflow-catalog)). `haus update` resolves the latest release tag by default (override with `HAUS_CATALOG_REF`; fallback `main` when no tag can be resolved). Catalog GitHub API calls authenticate via `HAUS_GITHUB_TOKEN` → `GITHUB_TOKEN` → `gh auth token` (unauthenticated falls back to 60 req/hr; rate-limit hits print a fix at end of sync).

---

## Workspace flow

Multi-repo "workspace" support (a meta-repo plus sibling member-repo clones) layers on top of the single-repo flows above.

1. **Root resolution.** `resolveRoots()` (`src/utils/git-root.ts`) distinguishes a linked `git worktree` from its main checkout via `--git-dir` vs `--git-common-dir` — every workspace command resolves to the real repo/workspace root, not a worktree slug, even when invoked from inside a workspace worktree.
2. **Member resolution.** `readMembers()` (`src/workspace/members.ts`) bridges `haus.workspace.yaml` (code-parsed via `src/commands/workspace/config.ts`) and `repos.manifest.json` into one normalized `Member[]` — either config source works, no consolidation required (ADR-0026). `repos.local.json`'s `pathOverrides` are honored and normalized to absolute paths regardless of how they were written.
3. **Worktree materialization** (`haus workspace worktree add`, `src/workspace/worktree/`): one real `git worktree` per member repo (never a symlink — ADR-0029), all on the same mirrored branch. Hydration is copy-on-write clone of `node_modules`-class dirs (`cow-copy.ts`, filesystem-type-gated — never a silent full copy) followed by lockfile-driven install-reconciliation (`install.ts`). State is tracked per workspace-worktree in `.haus-worktree.json`, including each member's `absPath` at materialization time so `remove` can still unregister a member that later drops out of the workspace config.
4. **Cross-repo context linking** (`haus workspace link-context`, `src/workspace/link-context/`): copies (never symlinks — ADR-0028) each haus-initialized member repo's `.claude/{skills,agents,commands}` into the workspace root's own `.claude/`, prefixed `<repo-folder>--<name>` to avoid collisions. Source hashing for staleness detection is symlink-safe (`hashInstalledPaths(..., { followSymlinks: false })`) so it never reflects content the copy step itself would refuse to copy.
5. **Workspace doctor** (`haus workspace doctor`) reports drift against `.haus-workflow/workspace.manifest.json` — version mismatch, missing `.claude`/lock, failed setup, catalog-ref mismatch — plus `linkedContext` staleness/missing-source/missing-copy.

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

| File                                           | Written by                                                 | Tracked in git?                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `.haus-workflow/context-map.json`              | `scan`                                                     | No — gitignored, `apply --write` untracks if found tracked (ADR-0025)                    |
| `.haus-workflow/dependency-map.json`           | `scan`                                                     | No                                                                                       |
| `.haus-workflow/scan-hashes.json`              | `scan`                                                     | No                                                                                       |
| `.haus-workflow/repo-summary.md`               | `scan`                                                     | No                                                                                       |
| `.haus-workflow/recommendation.json`           | `recommend`                                                | No — gitignored, untracked if found tracked                                              |
| `.haus-workflow/sources-report.json`           | `scan`                                                     | No — gitignored, untracked if found tracked                                              |
| `.haus-workflow/deep-context.json`             | `writing-documentation` skill (LLM-authored, not this CLI) | No — gitignored, untracked if found tracked                                              |
| `.haus-workflow/selected-context.json`         | `apply`                                                    | Yes                                                                                      |
| `.haus-workflow/haus.lock.json`                | `apply`                                                    | Yes — registry of what's installed, not scan output                                      |
| `.claude/*`                                    | `apply`                                                    | Yes                                                                                      |
| `.claude/worktrees/<slug>/.haus-worktree.json` | `workspace worktree add`                                   | No — gitignored, machine-local materialization state                                     |
| `.haus-workflow/workspace.manifest.json`       | `workspace setup`, `workspace link-context`                | Yes — advisory record, `linkedContext` section round-trips across `setup --write` reruns |
