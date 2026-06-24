# Runbook

One entry per non-obvious failure resolved. Append-only.

## validation-rules.json drift (contract-check FAIL)

**Symptom:** `contract-check.mjs` BP#1 reports
`validation-rules.json DRIFT vs live catalog`, or the `Contract drift` workflow
fails on main/cron. **Cause:** the catalog repo changed `validation-rules.json`
and the synced copy in this repo (`library/catalog/validation-rules.json`) is
stale. **Fix:** run the catalog sync to refresh the committed copy and merge the
resulting sync PR (the same mechanism that syncs `manifest.json`; see ADR-0001).
Re-run `node scripts/contract-check.mjs` to confirm BP#1 passes.

## decisions-triggers.json drift (contract-check BP#1b FAIL)

**Symptom:** `contract-check.mjs` BP#1b reports `decisions-triggers.json DRIFT vs live catalog`.
**Cause:** `haus-workflow-catalog/decisions-triggers.json` changed and
`library/catalog/decisions-triggers.json` in the CLI repo is stale.
**Fix:** copy or sync from catalog release (same flow as `validation-rules.json`;
see ADR-0008). Re-run contract-check.

## Enable ADR enforcement in a client repo

**Goal:** decision-worthy PRs require `docs/decisions/NNNN-*.md` + README index row.
**Steps:**

1. Merge catalog release with `haus.adr-decisions` skill and workflow template v1.1+.
2. `haus apply --write` — seeds `docs/decisions/README.md`, Stop hook, `@import` in `CLAUDE.md`.
3. Paste `templates/decisions-ci-gate.yml` into `.github/workflows/ci.yml` (or use `haus workspace setup` when available).
4. Optional: add `haus decisions check --staged` to lefthook pre-commit.
5. Migrate brownfield `docs/adr/` → `docs/decisions/` if present (`git mv`).

**Escape hatch:** `[adr-skip]` in PR body with justification (not for auth/security paths).

## Catalog fixture sync (manifest + validation-rules)

**Primary:** `sync-catalog-from-release` workflow in `.github/workflows/` — runs weekly (Monday 06:00 UTC) and on `workflow_dispatch`. Resolves latest `vX.Y.Z` tag from [haus-workflow-catalog](https://github.com/WeAreHausTech/haus-workflow-catalog), diffs `library/catalog/*` (including `validation-rules.json` and `decisions-triggers.json`), opens/updates PR on branch `chore/sync-catalog-fixture`. No catalog-repo PAT required.

**Backup:** catalog `dispatch-fixture-sync` on release tag push still fires `repository_dispatch` → `sync-catalog-fixture` (same PR branch). Retire `HAUS_WORKFLOW_DISPATCH_TOKEN` after pull-based sync is stable in production.

**Manual:** Actions → _Sync catalog from release_ → optional `catalog_ref` (e.g. `v2.7.3`); or _Sync catalog fixture_ with `catalog_ref` input.

## Fixture vs schema drift (contract-check BP#3 FAIL)

**Symptom:** BP#3 reports a fixture item `uses field "X" the live schema does
not declare` or `omits "Y" which the live schema now REQUIRES`. **Cause:** the
catalog `catalog-item.schema.json` added/removed/renamed a field; the curated
fixture (`tests/fixtures/catalog/manifest.json`) no longer matches the
contract. **Fix:** edit the fixture to drop the removed field or add the newly
required one (keep it a minimal curated subset). If the new required field is
deliberately omitted, add it to `requiredOmitExempt` in `contract-check.mjs` — a
conscious decoupling decision.

## Installed skill shows wrong description / no menu in Claude Desktop

**Symptom:** `/haus-workflow` with no task does not present its `AskUserQuestion`
menu in Claude Desktop, and/or the skill's description shows as a literal
`<!-- HAUS-MANAGED ... -->` comment. **Cause:** the global install stamped the
ownership marker as an HTML comment on line 1 of `SKILL.md`, pushing the YAML
frontmatter off line 1 so Claude Code could not register the skill correctly
(see ADR-0006). **Fix:** the marker now lives inside the frontmatter as a
`haus_managed:` field (`src/install/header.ts`); re-run `haus install` (or
`haus install --force` if the file was hand-edited) to restamp. Verify the
installed `~/.claude/skills/haus-workflow/SKILL.md` starts with `---` on line 1
and carries a real `name`/`description`. Then confirm in Desktop that the menu
appears; if it still does not after a valid frontmatter install, the gap is
client-side `AskUserQuestion` rendering, not the skill file — raise separately.

## Stale or deprecated catalog item not removed after update

**Symptom:** An item was removed from the catalog manifest — or marked
`reviewStatus: deprecated` — but its copy remains under `.claude/skills/` (or
agents/commands/templates) after `haus update`. **Cause:** two possibilities. (1)
apply only deletes stale/deprecated items when on-disk content still matches the hash
in `haus.lock.json` — if you edited the file locally, cleanup skips it with a warning.
(2) The deprecated-prune path shipped in CLI `0.30.0` (#126) — an older CLI never
prunes deprecated items, it only stops re-installing them. **Fix:** upgrade the CLI
first (`npm i -g @haus-tech/haus-workflow`), then run `haus update` so the
stale-cleanup pass removes them. For a locally-edited copy, delete the path manually or
restore the original content and re-run `haus apply --write`. Items you deselected with
`apply --select` but that still exist in the catalog as approved are intentionally left
in place.

## An opt-in skill/agent never installs (and how to add one later)

**Symptom:** A tier helper (code-review superpowers, TDD, git-worktrees, Redis
security/observability, security/performance/refactor reviewers, the UI designer,
incident tracer, Laravel plugin discovery) is in the catalog but `haus apply` never
installs it. **Cause:** these are **opt-in tier** items — `default: false` and gated
by a `role:*` `requiresAny`. With no matching role in the scan or
`.haus-workflow/deep-context.json`, they are skipped (`requires-any-unsatisfied`) and
listed under `recommendation.json#optInEligible[]` (grouped by `optInGroup`), not
installed. This is intended — it keeps the baseline lean.

**Fix / how to add one:**

- In Claude Code (preferred): run `/haus-workflow` → **`project:add-skills`**, or pick
  the opt-in options during `/haus-setup`. Both present the groups in plain language
  and wire the commands for you.
- By hand: run `haus recommend --include <id> [<id> …]` (promotes them to the
  `manual` selection mode), then `haus apply --write`. Or add the gating role to
  `.haus-workflow/deep-context.json#roles` and re-run `haus recommend` followed by
  `haus apply --write`.

**Role → opt-in group map** (catalog `optInGroup`, set in `manifest.json`):
`code-review` → Code review workflow · `tdd-workflow` → TDD workflow ·
`isolated-branch` + `branch-completion` → Git worktrees & branch finishing ·
`user-gate` → Quality gates · `subagent-workflow` → Subagent-driven development ·
`skill-authoring` → Skill authoring · `redis-ops` → Redis security & observability ·
`laravel-plugins` → Laravel plugin discovery · `security-review` → Security review ·
`performance-review` → Performance review · `refactor-cleanup` → Refactor cleanup ·
`incident-trace` → Incident tracing · `ui-design` → UI design.

## Haus ESLint/Prettier config won't install / overwrote nothing

**Symptom:** `haus scaffold` reports `Skipping <path>: already exists` and writes
nothing for a project that already has an `eslint.config.*` / `prettier.config.*` /
`.prettierrc`. **Cause:** scaffold **preserves existing project-root config by
default** — it never clobbers a user-owned config on a plain run. **Fix:** to replace
it deliberately, re-run `haus scaffold <id> --force`. In Claude Code the `/haus-setup`
and `project:add-skills` flows ask before passing `--force`; never default to
overwrite.

## Coverage ratchet says raise the floor

**Symptom:** `coverage-ratchet.mjs` prints a non-fatal hint
`global <metric>: N% exceeds floor M% by >=1pp — raise floor to N`. **Cause:**
coverage climbed comfortably above the recorded floor; the floor should ratchet
up to lock in the gain. **Fix:** bump the corresponding metric floor in
`.c8rc.json` to the suggested value (never auto-edited; raise by hand only).
Re-run `yarn test:coverage && node scripts/coverage-ratchet.mjs` to confirm PASS.

## `haus doctor` says WORKFLOW.md was edited when it wasn't

**Symptom:** `haus doctor` reports `.haus-workflow/WORKFLOW.md: modified locally`
(and `haus apply` skips it as "content modified by user") on a file the user never
touched — recurring even right after `haus update`. **Cause:** the project formatter
reformats the managed file. `WORKFLOW.md` carries a content hash in its HAUS-MANAGED
header; when prettier rewrites the body (via the lefthook `format` step, editor
format-on-save, or a manual run) the body no longer matches the embedded hash, so
detection reports a phantom edit. **Fix:** `haus apply --write` now writes a
`.prettierignore` block covering `.haus-workflow/` (see
`src/claude/write-prettierignore.ts`) so the formatter leaves managed files alone.
On an already-mutated file, restore it once with `haus apply --write --force`; the
ignore prevents recurrence.
