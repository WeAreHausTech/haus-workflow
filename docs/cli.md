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

### `haus recommend [--json] [--include <ids...>]`

Recommend catalog items for the detected stack via binary eligibility (policy gates + match signals; no scores). Includes `recommended[]` with `reasons[]`, `selectionMode` (`baseline` | `matched` | `manual`), and `install` (`false` for `config` items). `skipped[]` carries `skipReasons[]`. Config items (ESLint, Prettier) appear when the scanner reports `missing-eslint` / `missing-prettier`; install them with `haus scaffold`, not `haus apply`. If `.haus-workflow/deep-context.json` is present (written by the `writing-documentation` skill), its signals are merged in for a second-pass recommendation.

- `--include <ids...>` — force opt-in catalog items into `recommended[]` as `manual` selections (space- or comma-separated). Hard policy blocks (deprecated/blocked/unsupported/sensitive/untrusted-source) are never forced — they warn instead; unknown ids and unsatisfied `requiresAny` gates also warn.

`recommendation.json` also carries **`optInEligible[]`**: role-gated tier items skipped because their role gate is unsatisfied, each with `optInTier`, `optInGroup`, `purpose`, and `tokenEstimate`. These are the items `--include` can add. **This and `--include` are the backend for the Claude Code opt-in UX** (`/haus-workflow project:init`, `/haus-workflow project:add-skills`) — surface them as plain-language choices, not raw flags.

Output: `.haus-workflow/recommendation.json`

### `haus apply [--dry-run] [--write] [--select] [--ids <ids...>] [--allow-empty-cache] [--refill-config] [--force]`

Materialize catalog assets into `.claude/` (skills, agents, commands, templates).

- `--dry-run` — preview what would be written without writing
- `--write` — write `.claude/` files, `.haus-workflow/selected-context.json`, and `.haus-workflow/haus.lock.json`
- `--select` — interactively select catalog items before applying (deselected items that remain in the catalog are **not** removed from disk)
- `--ids <ids...>` — install exactly these recommended item ids non-interactively (skill backend; no TTY needed). Ids absent from `recommendation.json` warn and are ignored. Mutually exclusive with `--select`.
- `--allow-empty-cache` — apply core files only when catalog cache is empty (skip catalog items without error)
- `--refill-config` — fill still-blank `<!-- fill in -->` fields in `workflow-config.md` from auto-detected values, without touching fields you've edited
- `--force` — overwrite managed workflow template even when local tamper detection sees edits

**Stale cleanup:** before rewriting the lock, apply compares the previous
`haus.lock.json` against the current catalog manifest. Items removed upstream or marked
`reviewStatus: deprecated` are deleted from `.claude/` when their content still matches
the recorded lock hash; user-modified copies are left in place with a warning. Items
still in the manifest as approved but deselected this run (e.g. via `--select`) are not
pruned. Empty parent dirs are pruned.

After writing `.claude/settings.json`, apply runs a self-check that it matches `CANONICAL_HOOKS` in `src/claude/load-hooks.ts`. Throws on drift.

> `config`-type catalog items (ESLint, Prettier) are **not** written by apply — they
> live in the project root and are user-owned. `haus recommend` surfaces them when
> `eslint` / `prettier` is missing; distribute files with `haus scaffold`.

### `haus scaffold [ids...] [--force] [--dry-run] [--root <path>]`

Copy `config`-type catalog items (ESLint, Prettier) into the project root. Explicit,
one-time bootstrapping — never auto-run by apply, so customised configs are not
clobbered on update. **Existing project-root config files are preserved by default**;
`--force` is the only overwrite path. When a file is skipped, the command prints the
project-relative path and the `--force` hint. The Claude Code setup flows
(`/haus-workflow project:init`, `/haus-workflow project:add-skills`) ask before ever
passing `--force`.

- pass item IDs (e.g. `haus.eslint-config haus.prettier-config`) to scaffold specific items; omit to scaffold all approved config items
- `--force` — overwrite existing files
- `--dry-run` — preview without writing
- `--root <path>` — project root (defaults to cwd)

Single-file items copy the file to the root (`configs/eslint/eslint.config.mjs` →
`<root>/eslint.config.mjs`); directory items copy each entry (`configs/prettier/` →
`<root>/`). Logic: `src/install/scaffold.ts`; command: `src/commands/scaffold.ts`.

### `haus update [--check] [--from-hook]`

Sync remote catalog, refresh global install (`~/.claude/`), and re-apply project files.

- `--check` — validate lock presence and version fields; exit non-zero if stale
- `--from-hook` — SessionStart hook mode (installed per-project as `haus.update-check`,
  see `src/claude/merge-project-settings.ts`): silently checks whether this project is
  behind the installed haus npm package/catalog/lock; prints nothing when up to date,
  emits a `hookSpecificOutput.additionalContext` note nudging `/haus-workflow project:refresh`
  when it's behind. Never fails the session on a network error — fails silent instead.
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

> Cross-session memory uses Claude Code's native `MEMORY.md` — haus ships no memory
> command or store.

---

## Guards

### `haus guard file-access [--from-hook]`

Block sensitive path access. Returns an explicit deny reason payload.

### `haus guard bash [--from-hook]`

Block dangerous bash command tokens. Returns an explicit deny reason payload.

---

## Workspace

### `haus workspace init`

Initialize `haus.workspace.yaml` in the current directory.

### `haus workspace discover`

Auto-discover workspace member repos and write `.haus-workflow/workspace-manifest.json`.

### `haus workspace scan`

Run scans across discovered/configured workspace repos.

### `haus workspace setup`

Run setup flow across workspace repos.

### `haus workspace doctor`

Run health checks across workspace repos.

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
`description:`, safety scans (forbidden stack tags, risky install patterns, `npx tsx`
allowlist with `source: curated` waiver per catalog ADR-0005, tag allowlist), and
`source: curated` + `reviewStatus: approved` gate. Rules load from bundled
`library/catalog/validation-rules.json` (synced from catalog — ADR-0001).

### `haus decisions` / `haus adr`

Architecture Decision Record (ADR) gate and drafts. Alias: `haus adr` = `haus decisions`.

| Subcommand                         | Purpose                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `check [--staged \| --range A..B]` | Fail when decision-worthy diff lacks `docs/decisions/NNNN-*.md` + README row |
| `suggest [--from-hook] [--title]`  | Draft ADR from diff; `--from-hook` for Stop hook JSON on stdout              |
| `next-number`                      | Print next four-digit decision number                                        |
| `validate <path>`                  | Validate decision markdown structure                                         |

**Triggers** load from `library/catalog/decisions-triggers.json` (synced from catalog).
Escape hatch: `[adr-skip]` in PR body (ignored for security/auth path changes).
Disable gate: `.haus-workflow/adr-gate.json` with `{ "mode": "off" }` (doctor advises).

`haus apply --write` seeds `docs/decisions/README.md` when missing and adds
`@docs/decisions/README.md` to the `CLAUDE.md` import block.

**Consumer CI:** paste `templates/decisions-ci-gate.yml` from the catalog, or run
`node scripts/decisions-gate.mjs --range origin/main..HEAD` after `yarn build`.

**Optional lefthook** (pre-commit):

```yaml
decisions-check:
  run: haus decisions check --staged
  fail_text: 'Staged change needs an ADR under docs/decisions/. Run `haus decisions suggest`.'
```

---

## Global slash command (Claude Code)

`haus install` seeds `~/.claude/skills/haus-workflow/` so `/haus-workflow` appears in
every project's `/` menu — including before first setup, the main discovery path for
non-developers. Everything routes through this one skill; there are no separate
`/haus-setup`, `/haus-clone`, `/haus-cloneandsetup`, `/haus-doctor`, or `/haus-fix`
commands. Pass a task name, or invoke with none for a menu:

- `/haus-workflow project:init` (aliases `setup`, `init`) — runs `haus setup-project --json`,
  narrates detection in plain language, then applies the basics and writes the project docs.
- `/haus-workflow project:reinit` (aliases `reinit`, `re-init`) — full re-setup: confirms,
  runs `haus undo --yes` (backs up haus-managed files first), then re-runs `project:init`.
- `/haus-workflow project:doctor` (aliases `doctor`, `check`) — runs `haus doctor` and
  relays the verdict in plain language.
- `/haus-workflow project:fix` (alias `fix`) — runs `haus doctor` then applies each
  suggested fix, re-checking until green.
- `/haus-workflow help` (alias `?`) — explains what haus-workflow is and lists tasks;
  touches no files.

See [`library/global/skills/haus-workflow/SKILL.md`](../library/global/skills/haus-workflow/SKILL.md)
for the full task table (`project:clone`, `project:cloneandsetup`, `project:add-skills`,
`project:refresh`, `update`, `install`, `uninstall`).
