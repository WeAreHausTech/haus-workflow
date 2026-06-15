# Plan: Add reviewer/utility agents to the catalog + multi-source upstream sync

> Source docs: `manifest.json` (spec), `schema/catalog-item.schema.json` (item schema),
> `scripts/sync-upstream.mjs` (sync), `.github/workflows/upstream-sync.yml` (CI).

## Goal

Ship 11 external agents as `type: agent` catalog items, installable via `haus setup`,
and wire two new upstream sources into the existing weekly sync so the agent files
stay current the same way superpowers skills/commands do.

## Decisions (confirmed with user)

1. **Sync architecture:** generalize `scripts/sync-upstream.mjs` to iterate **all**
   `sources.yaml` entries, with a per-source `mode`:
   - `mirror` — existing superpowers behavior (full-dir, auto-add new items).
   - `select` — agents: sync **only** an explicit per-source `items[]` allowlist; never
     auto-add upstream additions.
2. **Drift model for agents:** pinned allowlist. Drift check flags only content changes
   to the 11 listed agents. Adding more later = manual `sources.yaml` edit.
3. **Default vs stack-gated** (`default` flag + `requiresAny`):

   | Agent | Source repo | Upstream path | Gate |
   |---|---|---|---|
   | react-reviewer | affaan-m/ECC | `agents/react-reviewer.md` | react |
   | react-build-resolver | affaan-m/ECC | `agents/react-build-resolver.md` | react |
   | php-reviewer | affaan-m/ECC | `agents/php-reviewer.md` | php |
   | csharp-reviewer | affaan-m/ECC | `agents/csharp-reviewer.md` | dotnet |
   | database-reviewer | affaan-m/ECC | `agents/database-reviewer.md` | db stacks |
   | e2e-runner | affaan-m/ECC | `agents/e2e-runner.md` | playwright/testing |
   | performance-optimizer | affaan-m/ECC | `agents/performance-optimizer.md` | **default** |
   | refactor-cleaner | affaan-m/ECC | `.kiro/agents/refactor-cleaner.md` | **default** |
   | test-engineer | yeachan-heo/oh-my-claudecode | `agents/test-engineer.md` | **default** |
   | designer | yeachan-heo/oh-my-claudecode | `agents/designer.md` | **default** |
   | tracer | yeachan-heo/oh-my-claudecode | `agents/tracer.md` | **default** |

   Gated items: `default: false` + `requiresAny`. Default items: `default: true`, no `requiresAny`.

## Recommendations (post-review)

1. **Parser: use a real YAML parser for `sources.yaml`, not a regex extension.** The `select`
   sources introduce nested `items:` arrays with multi-key objects (`name/type/upstreamPath`);
   the current scalar line-walker cannot handle these and a regex extension would be brittle.
   Add a YAML dep (e.g. `yaml` or `js-yaml`, already common) and parse the whole file.
   Constraint: superpowers `mirror` output MUST stay byte-identical — gate the swap on a
   golden diff of `node scripts/sync-upstream.mjs --check` before/after.
2. **Capture both upstream HEAD SHAs at Task 2 execution** (`git ls-remote <repo> HEAD`), pin
   them in `sources.yaml`, and replace the `<40-char SHA>` placeholders. Do not run Task 4
   fetch until SHAs are real — `originUrl`/`pinnedRef` derive from them.
3. **All 11 agents carry `ecosystem`** (source slug `ecc` / `oh-my-claudecode`) — gated and
   default alike — to match the 23/24 catalog convention. Schema-optional, convention-required.
4. **Keep Task 4→5→8 order fixed** — test gates fail if files lag the manifest (see Risks).

## CLI repo impact: NONE (verified)

The consumer CLI (`WeAreHausTech/haus-workflow`, local `../haus-workflow`) already
supports `type: agent` end-to-end — **no CLI changes required**:
- `CatalogItem.type` union includes `agent` (`src/types.ts:64`); `KNOWN_ITEM_TYPES`
  includes it (`src/catalog/remote-catalog.ts:209`).
- `targetDirForType` returns the bare subdir `'agents'` (composed to `.claude/agents/`
  downstream via `claudePath()`); installed via generic `.md` copy
  (`src/claude/write-claude-files.ts:32,232,244-247`).
- Recommender is type-agnostic — agents get the same `default`/`requiresAny`/stack gates
  as skills (`src/recommender/recommend.ts:84-206`). Our gating table works unmodified.
- Manifest fetched **live** at `HAUS_CATALOG_REF` (default `main`); agent `.md` fetched
  live per `item.path`. Path guard `isSafeCatalogPath` is **traversal-only** (no depth/
  format/regex limit), so nested `agents/<slug>/<name>.md` passes. Manifest changes reach
  consumers with no CLI release.
- Existing CLI tests already exercise agent caching + validation
  (`tests/remote-catalog.test.js`, `tests/validate-catalog-regression.test.js`), so the
  codepath is tested despite the catalog shipping 0 agents today.
- `sync-catalog-fixture` only copies `manifest.json` + `validation-rules.json` into the
  CLI's `library/catalog/` fixtures — no agent logic affected.

> Aside (out of scope): CLI's `type: "rule"` is in the TS union but missing from
> `targetDirForType`/`KNOWN_ITEM_TYPES`, so a rule item would silently skip. Not our
> concern here; flag separately if rules are ever shipped.

## Facts established

- Both upstream repos are **MIT** → `assertMitLicense` gate passes.
- All agent files carry `description:` frontmatter → `checkRequiredFrontmatter` passes.
- `schema/catalog-item.schema.json` already enumerates `type: "agent"`.
- `scripts/validate.mjs` already validates agents (frontmatter + forbidden tags), and
  `agents/` is already in the orphan-scan `dirs` list and in `.prettierignore`.
- All needed tags already exist in `validation-rules.json#allowedStacks`
  (`agent`, `review`, `react`, `php`, `csharp`, `dotnet`, `database`, `testing`,
  `quality`, `frontend`) — **no allowlist edit required**.
- ECC agents are large (~2,500 lines) → high `tokenEstimate`; expected.
- `refactor-cleaner` lives under `.kiro/agents/`, not `agents/` — the `select` mode
  must read an explicit per-item upstream path, not assume `agents/<name>.md`.

---

## Tasks

### Task 1 — Isolated workspace
- **Do:** `git worktree add .claude/worktrees/catalog-agents -b feat/catalog-agents`
- **Acceptance:** branch `feat/catalog-agents` checked out off `main`; not working on `main`.
- **Verify:** `git branch --show-current` → `feat/catalog-agents`.
- **Deps:** none.

### Task 2 — Extend `sources.yaml` with two `select` sources
- **Do:** add two entries with `mode: select`, each carrying an `items[]` list. Each item
  declares `name`, `type: agent`, and `upstreamPath` (relative to upstream root). Pin
  `snapshotRef` to current upstream HEAD SHA of each repo; `useMode: copy`; `license: MIT`.

  ```yaml
  - id: ecc-affaanm
    repo: https://github.com/affaan-m/ECC
    license: MIT
    licenseConfidence: high
    snapshotRef: <40-char SHA of ECC HEAD>
    retrieved: 2026-06-12
    useMode: copy
    mode: select
    items:
      - { name: react-reviewer,        type: agent, upstreamPath: agents/react-reviewer.md }
      - { name: react-build-resolver,  type: agent, upstreamPath: agents/react-build-resolver.md }
      - { name: php-reviewer,          type: agent, upstreamPath: agents/php-reviewer.md }
      - { name: csharp-reviewer,       type: agent, upstreamPath: agents/csharp-reviewer.md }
      - { name: database-reviewer,     type: agent, upstreamPath: agents/database-reviewer.md }
      - { name: e2e-runner,            type: agent, upstreamPath: agents/e2e-runner.md }
      - { name: performance-optimizer, type: agent, upstreamPath: agents/performance-optimizer.md }
      - { name: refactor-cleaner,      type: agent, upstreamPath: .kiro/agents/refactor-cleaner.md }
  - id: omcc-yeachanheo
    repo: https://github.com/yeachan-heo/oh-my-claudecode
    license: MIT
    licenseConfidence: high
    snapshotRef: <40-char SHA of oh-my-claudecode HEAD>
    retrieved: 2026-06-12
    useMode: copy
    mode: select
    items:
      - { name: test-engineer, type: agent, upstreamPath: agents/test-engineer.md }
      - { name: designer,      type: agent, upstreamPath: agents/designer.md }
      - { name: tracer,        type: agent, upstreamPath: agents/tracer.md }
  ```
  > Existing `superpowers-pcvelz` entry gets an **explicit** `mode: mirror` field added.
  > (Parser still treats absent `mode` as `mirror` for safety, but every entry declares it.)
- **Acceptance:** `sources.yaml` parses; the existing `superpowers-pcvelz` entry is unchanged
  in behavior; SHAs are real 40-char commit hashes.
- **Verify:** `node -e "..."` smoke parse, or run the Task-3 `--check` once available.
- **Deps:** Task 1.

### Task 3 — Generalize `scripts/sync-upstream.mjs`
The script is currently single-source (`ORIGIN_SOURCE_ID` const) and full-dir mirror.
Refactor to multi-source while keeping superpowers output byte-identical.

- **Local layout:** curated agents land under `agents/<source-slug>/<name>.md`
  (e.g. `agents/ecc/react-reviewer.md`, `agents/oh-my-claudecode/test-engineer.md`) —
  mirrors the `skills/superpowers/` verbatim-curated convention and keeps room for future
  first-party `agents/haus-owned/`.
- **Changes:**
  1. Parse **all** source blocks from `sources.yaml`, not just `superpowers-pcvelz`.
     Each source exposes `id, repo, license, snapshotRef, retrieved, useMode, mode, items[]`.
     **The current parser (`parseSourcesYaml`/`extractSourceBlock`/`pick`, lines 60-74) is
     scalar-only, single-block, and CANNOT read a nested `items:` list — this is a parser
     rewrite, not a tweak.** Preferred: replace the regex parser with a real YAML parser
     for `sources.yaml` (handles nested arrays robustly); fallback: extend the line-walker
     to collect the `items:` block. Either way, golden-diff the superpowers `mirror` output
     before/after (see Risks). Every source declares `mode` explicitly; absent `mode` falls
     back to `mirror`.
  2. Branch on `mode`:
     - `mirror`: existing `analyzeDrift`/`applySync` over `skills/` + `commands/` (unchanged).
     - `select`: for each `items[]` entry, compare `agents/<slug>/<name>.md` against
       `<upstreamRoot>/<upstreamPath>`. On `--apply`: copy upstream→local, bump that item's
       manifest `version` (patch), refresh `originUrl`/`pinnedRef`/`tokenEstimate`, and
       re-derive `purpose`/`whenToUse` from frontmatter `description`. **Never auto-add**
       items not in `items[]`; **never remove** manifest agents (allowlist is authoritative).
  3. `originUrl` for agents = `${repo}/blob/${sha}/${upstreamPath}`.
  4. `id` scheme for curated agents: `haus.<source-slug>-<name>`
     (e.g. `haus.ecc-react-reviewer`). `originSourceId` = the source id.
  5. License gate (`assertMitLicense`) runs per source before `--apply`.
  6. Clone each source's HEAD independently; update each source's `snapshotRef`/`retrieved`
     in `sources.yaml` on apply.
- **Acceptance:**
  - `node scripts/sync-upstream.mjs --check` reports no drift for superpowers (behavior
    preserved) and "in sync" for the 11 agents once Task 4 has copied them.
  - `--apply` is idempotent: a second run yields "no changes".
  - Running `--apply` does **not** pull any ECC/oh-my-claudecode agent outside the 11.
- **Verify:** `node scripts/sync-upstream.mjs --check`; diff superpowers section of output
  against pre-refactor `git stash` run to confirm identical.
- **Deps:** Task 2.

### Task 4 — Fetch + commit the 11 agent files
- **Do:** run `node scripts/sync-upstream.mjs --apply` (or a one-shot fetch) to populate
  `agents/ecc/*.md` (8 files) and `agents/oh-my-claudecode/*.md` (3 files) verbatim from the
  pinned SHAs.
- **Acceptance:** 11 files exist, byte-identical to upstream at pinned SHA; each has
  `description:` frontmatter.
- **Verify:** `ls agents/ecc agents/oh-my-claudecode`; spot-check one file head.
- **Deps:** Task 3.

### Task 5 — Add 11 manifest entries
- **Do:** append one `type: agent` entry per file. Per-item fields:
  - `id`: `haus.ecc-<name>` / `haus.oh-my-claudecode-<name>`
  - `version: "1.0.0"`, `source: "curated"`, `type: "agent"`, `path: agents/<slug>/<name>.md`
  - `title`, `purpose`/`whenToUse` (from frontmatter `description`),
    `whenNotToUse` (default sentinel), `tags` (see table below), `repoRoles: []`
  - `tokenEstimate` (ceil(bytes/4)), `installMode: "copy-selected"`,
    `reviewStatus: "approved"`, `riskLevel: "low"`, `useMode: "copy"`,
    `license: "MIT"`, `licenseConfidence: "high"`, `originSourceId`, `originUrl`,
    `pinnedRef`, `ecosystem`
  - **Gated items:** `default: false` + `requiresAny` + `ecosystem`. **Default items:**
    `default: true`, no `requiresAny`. **All 11 agents carry `ecosystem`** (gated AND
    default): set it to the source slug (`ecc` / `oh-my-claudecode`). Rationale: 23 of 24
    existing default catalog items carry `ecosystem` (e.g. superpowers → `"superpowers"`);
    omitting it is schema-valid but breaks catalog convention. (`whenNotToUse` sentinel is
    cosmetic — no validator enforces its presence/content.)

  | id | tags | default | requiresAny | ecosystem |
  |---|---|---|---|---|
  | haus.ecc-react-reviewer | agent, review, react | false | `[{stack:react},{dependency:react}]` | react |
  | haus.ecc-react-build-resolver | agent, react | false | `[{stack:react},{dependency:react}]` | react |
  | haus.ecc-php-reviewer | agent, review, php | false | `[{stack:php}]` | php |
  | haus.ecc-csharp-reviewer | agent, review, csharp, dotnet | false | `[{stack:dotnet}]` | dotnet |
  | haus.ecc-database-reviewer | agent, review, database | false | `[{stack:postgresql},{stack:mysql},{stack:mariadb},{stack:mssql}]` | database |
  | haus.ecc-e2e-runner | agent, testing | false | `[{stack:playwright},{dependency:@playwright/test}]` | testing |
  | haus.ecc-performance-optimizer | agent, quality | true | — | ecc |
  | haus.ecc-refactor-cleaner | agent, quality | true | — | ecc |
  | haus.oh-my-claudecode-test-engineer | agent, testing | true | — | oh-my-claudecode |
  | haus.oh-my-claudecode-designer | agent, frontend | true | — | oh-my-claudecode |
  | haus.oh-my-claudecode-tracer | agent, quality | true | — | oh-my-claudecode |

  > All tags already in `allowedStacks`/`alwaysAllowedTags` — no `validation-rules.json` edit.
  > `default:true` items omit `requiresAny` but DO carry `ecosystem` (matches 23/24 existing
  > default items). Required schema fields per item: `id, type, source, version, path, tags,
  > repoRoles, tokenEstimate` — all others (incl. `title`/`purpose`/`whenToUse`) optional and
  > unvalidated for content.
- **Acceptance:** `yarn validate` passes; 11 new agent items present; type counts updated.
- **Verify:** `node scripts/validate.mjs ./manifest.json` → exit 0.
- **Deps:** Task 4.

### Task 6 — Wire sync into the weekly workflow
- **Do:** `.github/workflows/upstream-sync.yml` already runs `sync-upstream.mjs --apply`;
  after Task 3 it covers all sources. Update the workflow **name/PR title/body** to reflect
  multi-source ("upstream catalog sync") instead of "pcvelz/superpowers" only. Confirm the
  PR branch/commit message still make sense. No new secret needed (uses `github.token`).
- **Acceptance:** workflow YAML valid; copy no longer claims superpowers-only.
- **Verify:** `yamllint`/manual read; (optional) `gh workflow run upstream-sync.yml` dry check.
- **Deps:** Task 3.

### Task 7 — Update docs + counts
- **Do:**
  - `CLAUDE.md`: catalog-size line `68 items (60 skills, 0 agents, …)` →
    `79 items (60 skills, 11 agents, 2 templates, 6 commands)` and adjust the
    `haus`/`curated` split (curated 22 → 33). Update "Adding a new item" if the agent
    `agents/<slug>/` layout warrants a note.
  - `README.md`: if it lists sources or counts, add the two new sources + agents.
  - Add an ADR under `docs/adr/` for "multi-source upstream sync + select mode"
    (library/policy decision per WORKFLOW). Update `docs/adr/README.md` index.
- **Acceptance:** counts match `manifest.json`; ADR added + indexed.
- **Verify:** `node -e` recount vs CLAUDE.md prose.
- **Deps:** Task 5.

### Task 8 — Manifest version bump + release prep
- **Do:** bump `manifest.json` top-level `version` (MINOR — new items) per release flow.
  Do **not** restate version in prose. Use conventional commit `feat(agents): …`.
- **Acceptance:** `node scripts/check-manifest-version.mjs` logic satisfied at tag time;
  `yarn validate` + `yarn test` green.
- **Verify:** `yarn validate && yarn test`.
- **Deps:** Tasks 5–7.

### Task 9 — Review + integrate
- **Do:** adversarial code review (fresh context) of the sync refactor + manifest diff.
  Then squash-merge PR: `gh pr merge <n> --squash --delete-branch`.
- **Acceptance:** review clean; CI (validate + item-version check) green on PR.
- **Deps:** Task 8.

---

## Risks / open items
- **[HIGH] `sources.yaml` parser rewrite.** Current parser is scalar-only/single-block and
  cannot read nested `items:` — `select` mode requires a real YAML parser or a non-trivial
  line-walker extension. This is the largest risk in the plan. Mitigation: golden diff of
  superpowers `--check` output before/after to prove `mirror` output is byte-identical.
- **Upstream HEAD SHAs** for both repos must be captured at Task 2 time (pinned).
- **`tests/` suite** (`node:test` exercising the validator) may need a fixture/case for the
  new `agent` + `select`-source path — check `tests/` and extend if it asserts source/type
  coverage (TDD per WORKFLOW for validator changes).
- **Fixture sync:** Task 5 touches `manifest.json` → push to `main` dispatches
  `sync-catalog-fixture` to `WeAreHausTech/haus-workflow`. No action here beyond awareness;
  `validation-rules.json` is untouched so CLI enforcement is unaffected.
- **Dangling cross-references:** ECC `react-reviewer` mentions a sibling `typescript-reviewer`
  agent we are **not** importing. Prose only — no validation impact; acceptable.
- **Test-gate ordering is hard, do not reorder:** `tests/references.test.mjs:23-28` fails if
  any agent file is missing on disk; `schema.test.mjs:34` fails on any schema violation.
  Task 4 (fetch files) → Task 5 (manifest) → Task 8 (test) order is mandatory.
- **CLI cross-repo verified (read-only audit of `../haus-workflow`):** all 8 "CLI impact:
  NONE" claims TRUE — `type:agent` supported end-to-end, nested paths pass the traversal-only
  guard, no count/type test assertions break with 11 agents. Fixture sync (manifest +
  validation-rules only) is automatic and safe. **No CLI code changes required.**
