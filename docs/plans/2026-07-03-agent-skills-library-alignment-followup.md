# Follow-up: agent-skills-library alignment catalog changes

Parent plan (in `haus-workflow-catalog`):
[`2026-07-01-agent-skills-library-alignment.md`](https://github.com/WeAreHausTech/haus-workflow-catalog/blob/main/docs/plans/2026-07-01-agent-skills-library-alignment.md).
That plan landed 28 new catalog items, removed 3, and shipped several `scripts/sync-upstream.mjs`
fixes, taking the catalog from 94 → 119 items. None of it reaches this repo automatically — per
that repo's `docs/deployment.md`, propagation only happens once a release tag is cut there, and
this repo's own `sync-catalog-from-release` workflow (`.github/workflows/sync-catalog-from-release.yml`,
weekly Monday 06:00 UTC cron + manual `workflow_dispatch`) pulls the latest `vX.Y.Z` tag when it
runs. This doc records what needs attention here once that sync happens — checked against this
repo's actual code, not left as speculation.

## Findings (verified against this repo's current `main`, 2026-07-03)

### 1. Install path already handles the new LICENSE-bundling correctly — no CLI change needed

The catalog's `copyRepoLicenseIfPresent` (ADR-0009) now bundles a `LICENSE` file into every
synced skill's directory. `installCatalogSkill` (`src/claude/superpowers-install.ts:45`) installs
skills via `fs.copy(sourcePath, destination, { overwrite: true, ... })` — a full recursive
directory copy, not a per-filename allowlist. The `LICENSE` file will flow through to
`.claude/skills/` automatically. **No action required.**

(The `skillFiles` filter in `write-claude-files.ts:271` that only iterates `.md` files is used
solely for pre-copy frontmatter _validation_, not for deciding what gets copied — the actual copy
happens via `installCatalogSkill` against the whole `sourcePath` afterward.)

### 2. License handling has no MIT-only assumption — no CLI change needed

`src/types.ts:99-100` types `license` as a free-form SPDX string with the doc comment already
naming `"MIT", "Apache-2.0"` as examples. No file in `src/` branches on `license === 'MIT'` or
similar (`grep -rn "=== 'MIT'"` across `src/` returns nothing). License is passed through as
display/provenance metadata only. The new `Apache-2.0` (elastic) and `GPL-2.0-or-later`
(WordPress) items will install exactly like any MIT item. **No action required.**

### 3. Real, pre-existing recommender bug found: `haus.nx21-monorepo-patterns` never matched anything

`src/recommender/recommend.ts:153` hardcodes a hand-authored role-gate special case:

```ts
if (item.id === 'haus.nx21-monorepo-patterns' && !roleSet.has('nx-monorepo')) {
```

The real catalog item has always been id'd `haus.nx-monorepo-patterns` (confirmed in
`library/catalog/manifest.json:1392`) — never `nx21-monorepo-patterns`. This condition has
**never matched a real item** in production; it's dead code. The only place `nx21-monorepo-patterns`
exists is `tests/fixtures/catalog/manifest.json:557`, a synthetic test-only fixture crafted to
match the (wrong) hardcoded id — meaning the regression test that exercises this branch has never
actually validated against the real catalog id at all.

This is now moot for `nx` specifically, since `haus.nx-monorepo-patterns` no longer exists in the
new catalog (replaced by `haus.nx-nx-workspace` / `haus.nx-nx-generate` / `haus.nx-tag-conventions`,
none of which carry this hardcoded special case). But the sibling check two lines below —

```ts
if (item.id === 'haus.turbo-monorepo-patterns' && !roleSet.has('turbo-monorepo')) {
```

— **is currently correct** (matches the real id) and **will go dead the moment the fixture sync
lands**, since `haus.turbo-monorepo-patterns` is also removed (replaced by
`haus.turborepo-turborepo`). The generic `requiresAny`-based role gating will still correctly
gate the new item (its `requiresAny` includes `{role: turbo-monorepo}`), but this specific,
nicer skip message/reason code (`'required-role-missing'`, `'Required role missing: turbo-monorepo'`)
will silently stop firing for the new item.

**Task:** update `recommend.ts:153-168` — remove or fix the dead `nx21-monorepo-patterns` line
(pick: delete it entirely as inert dead code, or fix the typo'd id if the intent was ever
`nx-monorepo-patterns` — but that item is gone now too, so deleting is simplest), and update the
`turbo-monorepo-patterns` line to `haus.turborepo-turborepo` (same role token, `turbo-monorepo`,
carries over unchanged). Add a similar case for the new nx items if the same tailored skip message
is wanted for them (optional — the generic `requiresAny` gate already covers correctness, this is
purely about message quality).

**Verification:** update `tests/recommend-gate-regression.test.js` and
`tests/deep-context-enrichment.test.js` (both assert against `haus.nx-monorepo-patterns` /
`haus.turbo-monorepo-patterns` by exact id — see finding 4) in the same change, then re-run
`yarn test`.

### 4. Regression tests hardcode the 3 removed item ids — will break on sync

Confirmed via `grep -rn "nx-monorepo-patterns\|turbo-monorepo-patterns\|expo-react-native-patterns"`:

- `tests/recommend-gate-regression.test.js:98,114` — loads `library/catalog/manifest.json`
  directly (`CATALOG = path.resolve('library/catalog/manifest.json')`, line 14) and asserts
  `haus.nx-monorepo-patterns` is _not_ recommended for an nx-eslint-plugin-only fixture. Once the
  fixture sync replaces this manifest, the item won't exist at all, so this assertion needs to
  either target the new nx items or be retired/rewritten for what should now happen with the same
  fixture project.
- `tests/deep-context-enrichment.test.js:39,40,50,60,81` — also asserts on
  `haus.nx-monorepo-patterns` recommend/skip behavior across several passes (looks like it's
  testing a role-detection-improves-over-passes flow). Needs the same treatment.
- No hits for `expo-react-native-patterns` in `tests/` — only in the two manifest fixtures
  themselves, so removing/replacing it there is enough; no test logic references it by name.

**Task:** once the fixture sync PR lands (auto-opened by `sync-catalog-from-release.yml`), update
both test files in that same PR — retarget assertions at `haus.nx-nx-workspace`/
`haus.nx-nx-generate`/`haus.nx-tag-conventions` and `haus.turborepo-turborepo` as appropriate for
what each test is actually trying to prove (role-gating behavior, not the specific old id).

**Verification:** `yarn test` green after the fixture PR + these test updates land together —
don't let the fixture bump merge with red tests.

### 5. `tests/fixtures/catalog/manifest.json` is a hand-maintained synthetic fixture, not synced

This file is separate from `library/catalog/manifest.json` (the real synced one) — it's a
minimal, hand-crafted catalog used by some tests. It already has a stale/wrong id
(`nx21-monorepo-patterns`, finding 3) baked in. Not urgent to fix as part of this follow-up unless
touching the nx recommend-gate tests that use it — but worth knowing this second fixture exists
and drifts independently of the real sync.

### 6. Docs — no actionable staleness found

Checked `docs/cli.md`, `README.md`, and the `docusaurus-docs/*.mdx` files for hardcoded item
counts or references to the 3 removed skill names. The only numeric hits
(`docusaurus-docs/claude-code-guide.mdx:82,191,192`) are illustrative mock terminal-output
examples in a guide ("`haus recommend` — 12 skills, 3 agents matched"), not real counts derived
from this catalog — not stale, nothing to fix here.

### 7. Sync mechanism is real and already wired up

`.github/workflows/sync-catalog-from-release.yml` exists, runs weekly (Mondays 06:00 UTC) plus
manual `workflow_dispatch`, and pulls the latest `vX.Y.Z` tag from `haus-workflow-catalog` — no
PAT/token dependency on the catalog repo side for this (pull-based). The only gating step left is
**a release actually being cut** in `haus-workflow-catalog` from the branch with these changes —
until then this workflow has nothing new to pull.

## Rollout order

1. `haus-workflow-catalog`: merge the alignment-plan branch to `main`, cut a release (`yarn release`).
2. Either wait for the next Monday cron, or manually trigger `sync-catalog-from-release`
   (`workflow_dispatch`) here to pull it immediately.
3. In the same PR the sync bot opens (or a fast-follow before merging it): fix
   `recommend.ts:153-168` (finding 3) and update the two test files (finding 4). Don't merge the
   fixture bump with tests red.
4. Optional, low-priority: clean up `tests/fixtures/catalog/manifest.json`'s stale
   `nx21-monorepo-patterns` id (finding 5) if/when touching those tests anyway.

## Out of scope here

Findings 1, 2, and 6 required no code changes — recorded for completeness so nobody re-investigates
them. Nothing here re-litigates the parent plan's blocked/skipped tasks (6, 9, 14, 15, 16, 18) —
those stay as recorded in that repo's plan and its
`2026-07-02-blocked-license-tasks-handover.md`.
