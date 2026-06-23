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

## Catalog fixture sync (manifest + validation-rules)

**Primary:** `sync-catalog-from-release` workflow in `.github/workflows/` — runs weekly (Monday 06:00 UTC) and on `workflow_dispatch`. Resolves latest `vX.Y.Z` tag from [haus-workflow-catalog](https://github.com/WeAreHausTech/haus-workflow-catalog), diffs `library/catalog/*`, opens/updates PR on branch `chore/sync-catalog-fixture`. No catalog-repo PAT required.

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

## Stale catalog item not removed after update

**Symptom:** An item was removed from the catalog manifest but its copy remains under
`.claude/skills/` (or agents/commands/templates) after `haus update`. **Cause:** apply
only deletes stale items when on-disk content still matches the hash in
`haus.lock.json` — if you edited the file locally, cleanup skips it with a warning.
**Fix:** delete the path manually, or restore the original content and re-run
`haus apply --write` / `haus update`. Items you deselected with `apply --select` but
that still exist in the catalog are intentionally left in place.

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
