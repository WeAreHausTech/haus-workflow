# Follow-up: agent-skills-library alignment catalog changes

Parent plan (in `haus-workflow-catalog`):
[`2026-07-01-agent-skills-library-alignment.md`](https://github.com/WeAreHausTech/haus-workflow-catalog/blob/main/docs/plans/2026-07-01-agent-skills-library-alignment.md).
Landed in catalog PR
[#46](https://github.com/WeAreHausTech/haus-workflow-catalog/pull/46): **28 gross new items**, **3
removed**, **+25 net** (94 → 119). Also shipped several `scripts/sync-upstream.mjs` fixes and
ADR-0011 (non-MIT license verification — catalog repo only).

Propagation to this repo is pull-based: per `haus-workflow-catalog`'s `docs/deployment.md`, a
**release tag** must be cut there first; this repo's `sync-catalog-from-release` workflow
(`.github/workflows/sync-catalog-from-release.yml`, weekly Monday 06:00 UTC + manual
`workflow_dispatch`) resolves the latest `vX.Y.Z` tag and opens a fixture PR. Backup path:
`sync-catalog-fixture.yml` via `repository_dispatch` on catalog tag push (same PR branch
`chore/sync-catalog-fixture`).

**Status (2026-07-03):** catalog **`v3.4.0` released**; haus-workflow sync PR
[#165](https://github.com/WeAreHausTech/haus-workflow/pull/165) open (`chore/sync-catalog-fixture`,
syncs `manifest.json` + `validation-rules.json` + `decisions-triggers.json` from `v3.4.0`). Local
`main` still at `v3.3.0` / 94 items until that PR merges.

> **Note:** catalog PR
> [#47](https://github.com/WeAreHausTech/haus-workflow-catalog/pull/47) (upstream curated content
> sync) is separate from #46 — does not change the structural follow-up scope here.

This doc records what needs attention here once the fixture sync lands — checked against this
repo's actual code, not left as speculation.

## Findings (verified against this repo, 2026-07-03)

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

`src/recommender/recommend.ts:154` hardcodes a hand-authored role-gate special case:

```ts
if (item.id === 'haus.nx21-monorepo-patterns' && !roleSet.has('nx-monorepo')) {
```

The real catalog item has always been id'd `haus.nx-monorepo-patterns` (confirmed in
`library/catalog/manifest.json:1392` on pre-sync `main`) — never `nx21-monorepo-patterns`. This
condition has **never matched a real item** in production; it's dead code. Synthetic copies of the
wrong id exist in:

- `tests/fixtures/catalog/manifest.json:557`
- `tests/fixtures/catalog/policy-gates-manifest.json:197` (used by `recommend-eligibility.test.js`)

The `recommend-eligibility` test at `tests/recommend-eligibility.test.js:216-229` exercises this
branch via `policy-gates-manifest.json` — it has never validated against the real catalog id.

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

**Task:** update `recommend.ts:154-170` — delete the dead `nx21-monorepo-patterns` line (simplest;
the real `nx-monorepo-patterns` item is gone too), and update the `turbo-monorepo-patterns` line
to `haus.turborepo-turborepo` (same role token, `turbo-monorepo`, carries over unchanged). Add
similar cases for the new nx items if the same tailored skip message is wanted (optional — generic
`requiresAny` gate already covers correctness; this is purely message quality).

Also update `tests/fixtures/catalog/policy-gates-manifest.json` if the nx21 synthetic item is
retired or retargeted (see finding 4).

**Verification:** update the three test files in finding 4 in the same change, then re-run
`yarn test`.

### 4. Regression tests hardcode removed item ids — will break or go vacuous on sync

Confirmed via `grep -rn "nx-monorepo-patterns\|turbo-monorepo-patterns\|expo-react-native-patterns"`:

#### `tests/recommend-gate-regression.test.js:98,114`

Loads `library/catalog/manifest.json` directly (`CATALOG = path.resolve('library/catalog/manifest.json')`,
line 14). Asserts `haus.nx-monorepo-patterns` is _not_ recommended for an nx-eslint-plugin-only
fixture.

After sync this assertion becomes **vacuously true** (id no longer exists). Retarget: also assert
the new nx items (`haus.nx-nx-workspace`, `haus.nx-nx-generate`, `haus.nx-tag-conventions`) are
_not_ recommended for the same fixture.

**No `turbo-monorepo-patterns` assertions in this file** — only nx.

#### `tests/deep-context-enrichment.test.js:39,40,50,60,81`

Uses the **production** bundled catalog (no `HAUS_FIXTURE_CATALOG` override). Tests
`haus.nx-monorepo-patterns` recommend/skip behavior across deep-context enrichment passes.

After sync, `haus.nx-monorepo-patterns` is **gone from the catalog entirely** — it won't appear in
`skipped` _or_ `recommended`. Pass 1 line 40 (`skipped.has('haus.nx-monorepo-patterns') === true`)
**will fail**, not just pass 2. Retarget all assertions at a replacement id (e.g.
`haus.nx-nx-workspace` as the primary role-gated nx skill) and verify the same
deep-context-enrichment flow.

**No `turbo-monorepo-patterns` assertions in this file** — only nx.

#### `tests/recommend-eligibility.test.js:216-229`

Uses `tests/fixtures/catalog/policy-gates-manifest.json` (synthetic, not the production manifest).
Tests that `haus.nx21-monorepo-patterns` is skipped with `required-role-missing` when
`nx-monorepo` role is absent.

Deleting the nx21 hardcoded gate (finding 3) changes behavior: the synthetic item has
`requiresAny: [{stack: nx}]`, so without the hardcoded check it will be skipped for a different
reason (unsatisfied `requiresAny`, not `required-role-missing`). **Rewrite or retire this test**
along with the `policy-gates-manifest.json` nx21 entry when updating `recommend.ts`.

#### Expo

No hits for `expo-react-native-patterns` in test _logic_ — only in synthetic fixture manifests
(`tests/fixtures/catalog/manifest.json:127`). Replacement ids if/when updating that fixture:
`haus.expo-building-native-ui`, `haus.expo-native-data-fetching`, `haus.expo-upgrading-expo`,
`haus.callstack-react-native-best-practices`.

**Task:** in the same PR as the fixture sync (or a fast-follow before merging it), update all
three test files above plus `policy-gates-manifest.json` as needed. Retarget nx assertions at
`haus.nx-nx-workspace` / `haus.nx-nx-generate` / `haus.nx-tag-conventions` and turbo at
`haus.turborepo-turborepo` according to what each test is actually proving (role-gating behavior,
not the specific old id).

**Verification:** `yarn test` green — don't merge the fixture bump with red tests.

### 5. Synthetic fixtures drift independently of the production sync

Two hand-maintained catalogs exist besides `library/catalog/manifest.json`:

| File                                                | Used by                                           | Stale content                                                                     |
| --------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `tests/fixtures/catalog/manifest.json`              | Many apply/setup tests via `HAUS_FIXTURE_CATALOG` | `nx21-monorepo-patterns`, `turbo-monorepo-patterns`, `expo-react-native-patterns` |
| `tests/fixtures/catalog/policy-gates-manifest.json` | `recommend-eligibility.test.js`                   | `nx21-monorepo-patterns` (finding 3)                                              |

These do **not** auto-sync. Updating them is not blocking for the production-catalog sync PR, but
should happen when touching the recommend-gate tests (findings 3–4) to avoid two divergent nx
id stories.

### 6. Docs — hardcoded item counts are stale

Checked `docs/cli.md`, `README.md`, and `docusaurus-docs/*.mdx`. No references to the 3 removed
skill _names_, but **hardcoded `94 items` counts** that need updating after sync:

| File                                    | Line | Current                                                  | Target                                                                           |
| --------------------------------------- | ---- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `CLAUDE.md`                             | 27   | `94 items: 73 skills, 15 agents, 4 templates, 2 configs` | `119 items: 98 skills, 15 agents, 4 templates, 2 configs` (haus 25 / curated 94) |
| `docusaurus-docs/README.mdx`            | 65   | `94 items`                                               | `119 items`                                                                      |
| `docusaurus-docs/claude-code-guide.mdx` | 262  | mock terminal: `Catalog manifest — 94 items`             | `119 items`                                                                      |

Other numeric hits in `claude-code-guide.mdx` (e.g. line 82: "`haus recommend` — 12 skills, 3
agents matched") are illustrative mock output for a single project scan — not catalog totals; leave
those alone.

**Task:** update the three files above in the fixture-sync PR or an immediate fast-follow.

### 7. Sync mechanism is real and already in flight

`.github/workflows/sync-catalog-from-release.yml` exists, runs weekly (Mondays 06:00 UTC) plus
manual `workflow_dispatch`, and pulls the latest `vX.Y.Z` tag from `haus-workflow-catalog` — no
PAT/token dependency on the catalog repo side (pull-based). Catalog release **`v3.4.0` is cut**;
sync PR [#165](https://github.com/WeAreHausTech/haus-workflow/pull/165) is open.

The workflow syncs three files into `library/catalog/`:

- `manifest.json`
- `validation-rules.json` (includes 4 new `allowedStacks` tokens from PR #46: `myid`, `cgi`,
  `collection2`, `deployer-php` — no items use them yet; no CLI code change, data-driven via
  `src/catalog/validation-rules.ts`)
- `decisions-triggers.json` (unchanged in #46; rides along)

`contract-check` BP#1/BP#1b go red on `main` until the sync PR merges.

### 8. `decisions-gate` will block the bare fixture-sync PR

PR #165 currently fails **`decisions-gate`** and **`build`** (test failures from finding 4). The
large `manifest.json` diff crosses `decisions-triggers.json`'s `minLinesChanged: 200` threshold.
The v3.3.0 sync (PR #164) passed because the diff was smaller.

**Task:** the fixture-sync PR (or a commit on branch `chore/sync-catalog-fixture`) needs either:

- a short ADR in `docs/decisions/` documenting the catalog alignment fixture bump (add row to
  `docs/decisions/README.md`), or
- an explicit exemption documented in the PR body per `docs/decisions/0008-adr-enforcement-heuristics.md`

…in addition to the test/recommender fixes in findings 3–4. Don't merge with `decisions-gate` red.

### 9. Optional — smoke-test recommend for newly-covered stacks

Not blocking, but PR #46 added first-time coverage for stacks the recommender has never been
exercised against in this repo's regression suite: `mariadb`, `elasticsearch`, `mysql`, `vite8`,
`prisma`, `dotnet`/`csharp`, `redis`, `storybook`, `playwright`, `wordpress`, `laravel`, `php`,
`vue` (plus replacements for `nx`, `turbo`, `expo`).

Also catalog-only (no code change): `haus.supabase-supabase-postgres-best-practices` gained a
`postgresql` stack tag in `requiresAny` — plain-Postgres projects may now get this recommended.

**Task (optional):** spot-check `haus recommend` against minimal fixture projects per stack group;
consider adding permanent fixture coverage if gaps are found. See also the catalog-side integration
plan (`haus-workflow-catalog/docs/plans/2026-07-03-haus-workflow-catalog-integration-plan.md`,
Task D).

## Rollout order

1. ~~`haus-workflow-catalog`: merge alignment plan, cut release.~~ **Done** — `v3.4.0` tagged.
2. ~~Trigger fixture sync.~~ **In progress** — PR
   [#165](https://github.com/WeAreHausTech/haus-workflow/pull/165) open on
   `chore/sync-catalog-fixture`.
3. **On that PR (before merge):**
   - Fix `recommend.ts:154-170` (finding 3).
   - Update `tests/recommend-gate-regression.test.js`, `tests/deep-context-enrichment.test.js`,
     `tests/recommend-eligibility.test.js`, and `policy-gates-manifest.json` (finding 4).
   - Satisfy `decisions-gate` (finding 8).
   - Update doc counts (finding 6).
   - `yarn test` + `yarn verify` green.
4. **Optional / when touching nx tests anyway:** clean up `tests/fixtures/catalog/manifest.json`
   stale ids (finding 5).
5. **Optional:** smoke-test new stack recommend behavior (finding 9).

## Out of scope here

Findings 1 and 2 required no code changes — recorded so nobody re-investigates them. Nothing here
re-litigates the parent plan's blocked/skipped tasks (6, 9, 14, 15, 16, 18) — those stay as
recorded in that repo's plan and its `2026-07-02-blocked-license-tasks-handover.md`. Catalog PR
#47 (upstream curated content sync) is out of scope.
