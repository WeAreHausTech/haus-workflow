# CLI reference

`haus` command surface:

---

## Core workflow

### `haus init [--fast] [--json]`

First-run setup: scan → recommend → apply in one step. Use inside a project repo.

- `--fast` — skip interactive prompts
- `--json` — emit JSON output

### `haus setup-project [--guided] [--fast] [--json]`

Re-run setup on an existing project.

- `--guided` — step-by-step interactive mode
- `--fast` — non-interactive mode
- `--json` — emit JSON output

### `haus scan [--json]`

Scan repo and write context-map. Detects stacks, roles, package manager, and dependencies.

Output: `.haus-workflow/context-map.json`, `.haus-workflow/dependency-map.json`, `.haus-workflow/scan-hashes.json`, `.haus-workflow/repo-summary.md`

### `haus recommend [--json]`

Score and recommend catalog items for the detected stack. Includes `recommended[]` with `reasons[]`, `confidence`, `confidenceLevel`, `score`, and `skipped[]` with `skipReasons[]`.

Output: `.haus-workflow/recommendation.json`

### `haus apply [--dry-run] [--write] [--select] [--allow-empty-cache] [--refill-config]`

Materialize catalog assets into `.claude/`.

- `--dry-run` — preview what would be written without writing
- `--write` — write `.claude/` files, `.haus-workflow/selected-context.json`, and `.haus-workflow/haus.lock.json`
- `--select` — interactively select catalog items before applying
- `--allow-empty-cache` — apply core files only when catalog cache is empty (skip catalog items without error)
- `--refill-config` — fill still-blank `<!-- fill in -->` fields in `workflow-config.md` from auto-detected values, without touching fields you've edited

After writing `.claude/settings.json`, apply runs a self-check that it matches `CANONICAL_HOOKS` in `src/claude/load-hooks.ts`. Throws on drift.

### `haus update [--check]`

Sync remote catalog and refresh lockfile.

- `--check` — validate lock presence and version fields; exit non-zero if stale
- (no flag) — back up lockfile to `.haus-workflow/backups/`, recompute per-item hashes from current files, print unified lock diff

---

## Diagnostics

### `haus doctor [--hooks]`

Health check: hooks, `CLAUDE.md` import block (and that each `@.haus-workflow/*`
target resolves), managed files, catalog cache, CLI version. Prints a single
plain-language verdict line first (`✅ healthy` / `⚠️ N things need attention`,
each mapped to a fix command), with developer detail beneath.

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

Refresh local state without a full re-scan.

### `haus undo [-y | --yes]`

Remove `.claude/` and `.haus-workflow/` from the current project. Use `-y` / `--yes` to skip confirmation.

### `haus catalog-audit`

Audit local catalog manifest for issues.

### `haus validate-catalog [manifest]`

Validate a catalog manifest file.

---

## Global slash commands (Claude Code)

`haus install` seeds `~/.claude/commands/` so these appear in the `/` menu of every
project — including before first setup, the main discovery path for non-developers:

- `/haus-setup` — agent runs `haus setup-project --fast --json`, narrates detection in
  plain language, asks the guided questions as chat, writes the answers, then applies.
- `/haus-doctor` — agent runs `haus doctor` and relays the verdict in plain language.
- `/haus-fix` — agent runs `haus doctor` then applies each suggested fix.
