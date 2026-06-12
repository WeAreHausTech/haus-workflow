# CLI reference

`haus` command surface:

---

## Core workflow

### `haus init [--json]`

First-run setup: scan → recommend → apply in one step. Use inside a project repo.

- `--json` — emit JSON output

### `haus setup-project [--json]`

Re-run setup on an existing project. Prompts to confirm before writing (unless `--json`).

- `--json` — preview only; emit JSON output and write nothing

### `haus scan [--json]`

Scan repo and write context-map. Detects stacks, roles, package manager, and dependencies.

Output: `.haus-workflow/context-map.json`, `.haus-workflow/dependency-map.json`, `.haus-workflow/scan-hashes.json`, `.haus-workflow/repo-summary.md`

### `haus recommend [--json]`

Recommend catalog items for the detected stack via binary eligibility (policy gates + match signals; no scores). Includes `recommended[]` with `reasons[]` and `selectionMode`, and `skipped[]` with `skipReasons[]`. If `.haus-workflow/deep-context.json` is present (written by the `writing-documentation` skill), its signals are merged in for a second-pass recommendation.

Output: `.haus-workflow/recommendation.json`

### `haus apply [--dry-run] [--write] [--select] [--allow-empty-cache] [--refill-config]`

Materialize catalog assets into `.claude/` (skills, agents, commands, templates).

- `--dry-run` — preview what would be written without writing
- `--write` — write `.claude/` files, `.haus-workflow/selected-context.json`, and `.haus-workflow/haus.lock.json`
- `--select` — interactively select catalog items before applying (deselected items that remain in the catalog are **not** removed from disk)
- `--allow-empty-cache` — apply core files only when catalog cache is empty (skip catalog items without error)
- `--refill-config` — fill still-blank `<!-- fill in -->` fields in `workflow-config.md` from auto-detected values, without touching fields you've edited

**Stale cleanup:** before rewriting the lock, apply compares the previous
`haus.lock.json` against the current catalog manifest. Items removed upstream are
deleted from `.claude/` when their content still matches the recorded lock hash;
user-modified copies are left in place with a warning. Empty parent dirs are pruned.

After writing `.claude/settings.json`, apply runs a self-check that it matches `CANONICAL_HOOKS` in `src/claude/load-hooks.ts`. Throws on drift.

### `haus update [--check]`

Sync remote catalog, refresh global install (`~/.claude/`), and re-apply project files.

- `--check` — validate lock presence and version fields; exit non-zero if stale
- (no flag) — back up lockfile to `.haus-workflow/backups/`, fetch latest catalog into cache, refresh global `haus install`, re-run project apply (including stale-item cleanup), recompute per-item hashes, print unified lock diff

---

## Diagnostics

### `haus doctor [--hooks]`

Health check: hooks, `CLAUDE.md` import block (and that each `@.haus-workflow/*`
target resolves), managed files, catalog cache, CLI version. Prints a single
plain-language verdict line first — `✅ Your project is set up and healthy.` or
`⚠️ N thing(s) need attention:` followed by each issue mapped to a fix command —
with developer detail beneath.

- `--hooks` — verify `.claude/settings.json` matches the canonical hook contract; exits non-zero if missing or drifted

### `haus explain-recommendation [--json]`

Render explainability data directly from `.haus-workflow/recommendation.json` (no extra scoring pass).

### `haus context --task "<task>" [--json] [--verbose] [--from-hook]`

Return task-scoped selected rules plus context minimization stats. Selection narrows
the recommended set by classified task intents, then trims to a token budget
(`DEFAULT_CONTEXT_TOKEN_BUDGET`, 12k) — lowest-scoring non-baseline rules drop first;
baselines are never dropped.

---

## Global install

### `haus install [--dry-run] [--force] [--check] [--postinstall]`

Seed `~/.claude/` with HAUS-MANAGED skills, global slash commands, and hooks, and
merge `permissions.deny` (+ scoped `permissions.allow`) into `~/.claude/settings.json`.

- `--dry-run` — preview files that would be written
- `--force` — overwrite existing files
- `--check` — exit non-zero if any HAUS-MANAGED file is out of date
- `--postinstall` — used by the npm postinstall hook: prints a plain-language notice of
  what changed plus how to undo/disable; suppresses the verbose file list

Runs automatically on a **global** `npm i -g @haus-tech/haus-workflow` (via
`scripts/postinstall.mjs`): global-only, CI-skipping, non-fatal, idempotent. Disable
with `HAUS_NO_POSTINSTALL=1`.

### `haus uninstall [--force]`

Remove HAUS-MANAGED files from `~/.claude/` and strip haus-added hooks + deny/allow rules.

---

## Configuration

### `haus config enable <key>`

### `haus config disable <key>`

### `haus config status <key>`

Manage hook configuration. Keys: `hook.context`.

> Cross-session memory uses Claude Code's native `MEMORY.md` — haus ships no memory
> command or store (see the `haus.memory-conventions` catalog doc).

---

## Guards

### `haus guard file-access [--from-hook]`

Block sensitive path access. Returns an explicit deny reason payload.

### `haus guard bash [--from-hook]`

Block dangerous bash command tokens. Returns an explicit deny reason payload.

---

## Workspace

### `haus workspace init`

### `haus workspace scan`

Multi-project workspace operations.

---

## Utilities

### `haus refresh`

Re-scan the project (fast mode), refresh `.haus-workflow/sources-report.json`, and regenerate `recommendation.json` without running a full apply.

### `haus undo [-y | --yes]`

Remove haus-managed project files: lock-tracked catalog paths, core rules/commands,
and haus portions of `settings.json` / root `CLAUDE.md`. User-owned `.claude/` content
and scan artifacts under `.haus-workflow/` are preserved. Use `-y` / `--yes` to skip confirmation.

### `haus catalog-audit`

Audit local catalog manifest for issues.

### `haus validate-catalog [manifest]`

Validate a catalog manifest and on-disk content. Used by catalog repo CI.

Checks include: manifest structure, file existence, skill/agent/command frontmatter
`description:`, safety scans (forbidden stack tags, risky
install patterns, `npx tsx`-only allowlist, tag allowlist), and `source: curated` +
`reviewStatus: approved` gate. Rules load from bundled `library/catalog/validation-rules.json`
(synced from catalog — ADR-0001).

---

## Global slash commands (Claude Code)

`haus install` seeds `~/.claude/commands/` so these appear in the `/` menu of every
project — including before first setup, the main discovery path for non-developers:

- `/haus-setup` — agent runs `haus setup-project --json`, narrates detection in
  plain language, then applies the basics and writes the project docs.
- `/haus-doctor` — agent runs `haus doctor` and relays the verdict in plain language.
- `/haus-fix` — agent runs `haus doctor` then applies each suggested fix.
