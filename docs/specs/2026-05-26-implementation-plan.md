# Implementation Plan — Full-Scope v0.1 (revised)

**Date:** 2026-05-26
**Status:** Draft
**Supersedes:** `docs/specs/2026-05-25-implementation-plan.md`
**Scope:** Strategy pivot — **no Claude Code plugin**. `@haus-tech/haus-workflow` ships as a globally-installed npm package that seeds `~/.claude/` with `haus-`-prefixed skills, agents, and hooks. One phase = one PR unless explicitly marked correlated. Merge each PR to `main` before starting the next (CLAUDE.md workflow rule — no stacking).

## What changed vs. 2026-05-25 plan

1. **Plugin dropped.** `plugin/` directory removed. No marketplace install, no `/haus-*` slash commands, no `marketplace.json`. Distribution is npm-only.
2. **Global install model.** `haus install` copies `haus-`-prefixed files into the appropriate slots under `~/.claude/` (skills, agents, settings.json hook entries). Claude Code picks them up natively as user-level globals.
3. **Header marker convention.** Every file written into `~/.claude/` carries a unique top-of-file marker so the CLI can safely update / replace / remove its own files across versions without touching user content.
4. **Skill set trimmed.** Five skills deleted (outsourced to catalog). `haus-setup-project` rebranded as `haus-workflow` — one all-in-one entry point covering setup, update, sync, catalog refresh, and root `CLAUDE.md` regeneration.
5. **Root `CLAUDE.md`** stays minimal — top-level file uses Claude Code `@import` references to managed modular files (`haus-way-of-work.md`, `project.md`) under a haus-owned directory.
6. **Hooks live in `~/.claude/settings.json`** via HAUS-marked blocks (decided 2026-05-26).
7. **Install is explicit** — `npm install -g` only places the binary. User runs `haus install` to seed `~/.claude/` (decided 2026-05-26).

## Naming decisions (locked)

| Item | Name |
|---|---|
| CLI repo | `wearehaustech/haus-workflow` |
| Catalog repo | `wearehaustech/haus-workflow-catalog` |
| npm package | `@haus-tech/haus-workflow` |
| Binary | `haus` |
| File prefix in `~/.claude/` | `haus-*` |
| File header marker (line 1) | `<!-- HAUS-MANAGED id=<stable-id> v=<schema-version> -->` (or `# HAUS-MANAGED ...` / `// HAUS-MANAGED ...` per file syntax) |
| settings.json hook block markers | `// HAUS:BEGIN hooks` / `// HAUS:END hooks` (logical — JSON doesn't allow comments; use a top-level `_haus` key, see P5) |
| Root `CLAUDE.md` managed blocks | `<!-- HAUS:BEGIN project -->` … `<!-- HAUS:END project -->` |

## Outcome

At the end of this plan:

- Two public repos: `wearehaustech/haus-workflow` (CLI only) and `wearehaustech/haus-workflow-catalog` (manifest + items + outsourced skills).
- npm package `@haus-tech/haus-workflow` published as v0.1, public access, `bin: haus`.
- `haus install` seeds `~/.claude/` with `haus-`-prefixed skills, agents, and hook entries — all carry unique HAUS-MANAGED headers so update / delete is deterministic.
- `haus uninstall` removes every HAUS-MANAGED file and strips haus blocks from `~/.claude/settings.json`. User content untouched.
- `haus-workflow` is the single skill users invoke for: setup-if-not-set-up, update project setup, refresh `.claude` + `.haus-workflow/`, self-update npm package, fetch catalog updates, regenerate root `CLAUDE.md`.
- Five legacy skills removed (now lived in catalog: `haus-context-router`, `haus-workflow` (old), `haus-global-engineering-rules`, `haus-skill-author`, `haus-documentation-maintainer`).
- B4 remote catalog fetch implemented against `haus-workflow-catalog`.
- Project-root `CLAUDE.md` is minimal — uses `@import` to managed `haus-way-of-work.md` + `project.md`.
- Hook cost decisions from P2 wired into `~/.claude/settings.json` install logic (gate-default-off respected).
- Cleanup tracker enforced by CI until removed at v0.1 publish.

---

## Phase order

```
[done] P0 → P1 → P2 → P2b
         ↓
        P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10
```

P5 (global install layout) and P6 (root `CLAUDE.md`) can run in parallel if separate hands pick them up; P6 depends on P5 having defined the HAUS-MANAGED marker convention.

**Correlated PRs (ship in one PR):**
- **P4e** — delete `plugin/` directory (folded into P4 cleanup; see below).
- **P8a + P8b** — B4 remote fetch + catalog self-sync via `haus update`.
- **P9a + P9b** — repo public + npm scope rename.

---

## Phases already complete

- [x] **P0** — Repo rename to `haus-workflow`
- [x] **P1** — Cleanup tracker tooling (`scripts/cleanup-status.ts`, `docs/specs/pre-release-cleanup.md`)
- [x] **P2** — Hook cost audit (`docs/specs/2026-05-25-hook-cost-report.md`)
- [x] **P2b** — `.haus-ai/` → `.haus-workflow/` rename

The remaining phases below replace the 2026-05-25 versions of P3–P10.

---

## P3 — Mark scaffolding *(unchanged from 2026-05-25)*

Mark dev-only modules with `HAUS-PRERELEASE-CLEANUP` markers + spec rows.

**Targets** (confirm during PR):
- `src/sources/{github,prpm,skillkit,skills-sh}-source.ts`, `source-audit.ts`, `source-report.ts`, `load-sources.ts`, `types.ts` — keep one minimal adapter if B4 fetch path needs it; mark the rest.
- `src/curation/unsupported-stack-mention.ts`
- `scripts/audit-sources.ts`, `validate-source-decisions.ts`, `audit-curated.ts`, `library-audit.ts`, `verify-no-unsupported-tech.ts`, `validate-findings.ts`
- `library/curated/`, `library/curation/`
- Two of three explainability commands — pick the production one, mark the others.
- Any P2 "drop" hook code.
- **NEW:** entire `plugin/` directory (folded into P4e — see below).

**Acceptance**
- Markers + spec rows 1:1. `yarn cleanup:status` reports "OK". CI tracker job green.

---

## P4 — Remove scaffolding *(plugin removal added)*

**PR clusters**
- **P4a — sources subsystem.** Delete `src/sources/*` (minus the one B4 needs), tests, `scripts/audit-sources.ts`, `scripts/validate-source-decisions.ts`. Remove CLI command `haus sources *` unless one survives. Update `docs/external-sources.md`, `docs/curation.md`.
- **P4b — curation + library artifacts.** Delete `src/curation/`, `library/curated/`, `library/curation/`, `scripts/audit-curated.ts`, `scripts/library-audit.ts`, `scripts/verify-no-unsupported-tech.ts`, `scripts/validate-findings.ts`. Update `docs/curated-library.md`, `docs/curation.md`.
- **P4c — redundant explainability + dropped hooks.** Collapse explainability commands to one. Remove any P2-dropped hook code. Update `docs/commands.md`.
- **P4d — npm tarball trim.** Add `files:` allowlist in `package.json`. `npm pack --dry-run` clean.
- **P4e — Delete `plugin/` directory** (NEW). Drop `plugin/.claude-plugin/plugin.json`, `plugin/hooks/hooks.json`, `plugin/skills/`, `plugin/agents/`. Move any skill / agent sources that survive into `library/global/` (new) — see P5 for the new layout. Remove plugin-related references from `package.json`, `docs/`, README. Marketplace docs deleted.

**Acceptance**
- `yarn verify` green.
- Spec rows removed in same PR.
- `npm pack --dry-run` shows no `plugin/`, no `library/curated`, no `src/sources/*` orphans.
- `rg "marketplace"` outside changelogs / historical specs returns zero hits.

---

## P5 — Global install layout (`haus install` / `haus uninstall`) *(NEW — replaces old P5 plugin hardening)*

**Why now.** Plugin gone. Distribution mechanism must exist before catalog (P7) defines what gets installed and before root `CLAUDE.md` generator (P6) writes the first HAUS-MANAGED file.

### File layout under `~/.claude/`

```
~/.claude/
  skills/
    haus-workflow/SKILL.md             # the one all-in-one skill (renamed setup-project)
    haus-*/                            # additional haus-prefixed skills (none initially; catalog can publish more)
  agents/
    haus-code-reviewer.md
    haus-docs-researcher.md
    haus-planner.md
    haus-security-reviewer.md
    haus-test-reviewer.md
  settings.json                        # gains a `_haus` block (see below)
  haus/                                # haus-owned scratch dir for catalog cache, lockfile, manifest
    catalog-cache/
    install-manifest.json              # records every file haus owns + hash + version
```

### Source-of-truth layout in this repo (replaces `plugin/`)

```
library/
  global/
    skills/
      haus-workflow/SKILL.md
    agents/
      haus-code-reviewer.md
      haus-docs-researcher.md
      haus-planner.md
      haus-security-reviewer.md
      haus-test-reviewer.md
    settings-fragments/
      hooks.json                       # the hook entries to merge into ~/.claude/settings.json
```

These ship inside the npm tarball (via `files:` allowlist).

### Header marker convention

Every file written into `~/.claude/` starts with a single-line marker that the CLI uses to detect ownership:

| File type | Marker (line 1) |
|---|---|
| `.md` | `<!-- HAUS-MANAGED id=<stable-id> v=<schema-version> source=<package@version> -->` |
| `.json` | top-level key `"_haus": { "id": "<stable-id>", "v": "<schema-version>", "source": "@haus-tech/haus-workflow@<ver>" }` |
| `.sh`/`.js`/`.ts` (none planned) | `# HAUS-MANAGED ...` / `// HAUS-MANAGED ...` |

`<stable-id>` is generated once per source file (e.g. `skill.haus-workflow`, `agent.haus-code-reviewer`) and never changes across versions — that is the durable handle. Schema version `v` bumps when the install-manifest format changes.

### `~/.claude/settings.json` hook merging

JSON can't carry comments, so use a top-level `_haus` block as the marker. Install logic:

1. Read existing `~/.claude/settings.json` (create if missing).
2. Compute desired `hooks` entries from `library/global/settings-fragments/hooks.json`, filtering by P2 gate decisions (drop / gate-default-off respected).
3. Merge: store haus entries under `settings.hooks.*` AND record what was added under `settings._haus.hooks = [<stable-ids>]` so uninstall knows exactly what to strip.
4. Never touch hooks that weren't recorded under `_haus.hooks`. User-added hooks are preserved byte-for-byte.

### Commands

- **`haus install`** — copies source-of-truth files into `~/.claude/`, stamps each with HAUS-MANAGED header, writes `~/.claude/haus/install-manifest.json` (path → sha256 → stable-id → source version), merges hook entries. Idempotent. Prints summary.
- **`haus uninstall`** — reads install-manifest, deletes every recorded file, strips haus entries from `settings.json`, removes `~/.claude/haus/`. Refuses to delete files whose current hash doesn't match the manifest's stored hash (user has edited them) unless `--force`. Reports skipped paths.
- **`haus install --dry-run`** — prints planned diff, no writes.
- **`haus install --check`** — exits non-zero if any HAUS-MANAGED file is out of date vs. current package version (used by P8 self-sync).

### Update semantics (used by P8)

On `haus update` (or `haus install` re-run after a version bump):

| Existing file state | Action |
|---|---|
| Missing | Create. |
| Present, HAUS-MANAGED header matches stable-id, hash matches manifest | Overwrite if package version newer. |
| Present, HAUS-MANAGED header matches stable-id, hash diverges from manifest | User edited a haus file. Skip with warning. `--force` to overwrite. |
| Present, no HAUS-MANAGED header | Refuse. User owns the file. Warn loudly. |
| Listed in old manifest, no longer in package | Delete. |

### Deliverables

- `src/install/` new module: `manifest.ts`, `header.ts`, `settings-merge.ts`, `apply.ts`, `uninstall.ts`.
- `src/commands/install.ts`, `src/commands/uninstall.ts`.
- `library/global/` populated (skills + agents + settings-fragments).
- Header writer + parser tests covering each file type.
- Settings.json merge tests: empty file, file with user hooks, file with stale haus hooks, malformed JSON.
- Doc: `docs/global-install.md` describing layout, markers, and update rules.

### Skill changes inside this PR

- Delete from `library/global/skills/`: `haus-context-router`, `haus-workflow` (old), `haus-global-engineering-rules`, `haus-skill-author`, `haus-documentation-maintainer`. (They currently live in `plugin/skills/` — moved during P4e then immediately deleted here, or skipped during the P4e move.)
- Rename `haus-setup-project` → `haus-workflow`. Rewrite SKILL.md to be the all-in-one entry point:
  - Setup project if not set up (current setup-project behaviour).
  - Update project setup (`.claude/` + `.haus-workflow/`).
  - Self-update: detect new `@haus-tech/haus-workflow` on npm; offer `npm i -g` + `haus install` rerun.
  - Fetch catalog updates (delegates to `haus update`).
  - Regenerate root `CLAUDE.md` (delegates to P6 generator).

### Acceptance

- Fresh `~/.claude/` (none of the haus dirs exist): `haus install` creates expected layout, every haus file carries a HAUS-MANAGED header, `settings.json` has `_haus` block + hook entries.
- Re-run `haus install` is a no-op (idempotent).
- User edits a haus file: `haus install` skips with clear warning. `--force` overwrites.
- User adds own hook to `settings.json`: `haus uninstall` removes haus entries but preserves user's hook byte-for-byte.
- `haus uninstall` on clean haus install: `~/.claude/` returns to pre-install state for haus-owned slots; user files untouched.
- `rg HAUS-MANAGED ~/.claude` after install lists every haus file; after uninstall returns zero hits.

---

## P6 — Project root `CLAUDE.md` generator (revised)

**Why now.** Claude Code reads the project-root `CLAUDE.md`. Per the user's revised direction, the root file stays **minimal**: it contains haus-owned `@import` lines that pull in modular managed files. Heavy content lives in the imported files, not in the root.

### Layout

```
<project-root>/
  CLAUDE.md                            # minimal, has HAUS:BEGIN/END project block with @imports
  .haus-workflow/
    haus-way-of-work.md                # general haus instructions (template from catalog)
    project.md                         # auto-generated project facts (stack, commands, structure)
```

`CLAUDE.md` body (the haus-owned block):

```markdown
<!-- HAUS:BEGIN haus-imports v=1 -->
@.haus-workflow/haus-way-of-work.md
@.haus-workflow/project.md
<!-- HAUS:END haus-imports -->
```

Anything outside the markers is user content. `haus apply` only ever edits between the markers.

### Generator behaviour

- `haus init` and `haus apply --write`:
  - Ensure `.haus-workflow/haus-way-of-work.md` exists, content sourced from catalog (P7). Top of file: `<!-- HAUS-MANAGED id=template.way-of-work v=1 source=@haus-tech/haus-workflow-catalog@<ver> -->`.
  - Ensure `.haus-workflow/project.md` exists, rendered deterministically from `context-map.json` + `recommendation.json` + repo summary. Same HAUS-MANAGED header.
  - Ensure root `CLAUDE.md` contains the `HAUS:BEGIN haus-imports` block. File-creation policy:
    - Missing → create with header + the import block.
    - Exists, block present → update only inside markers (idempotent, silent on `init`, diff+confirm on `apply`).
    - Exists, no block → append block at end with one-line note. Never touch content outside markers.
- `haus update` re-renders `haus-way-of-work.md` (catalog template can change) and `project.md` (repo state can change). Both are HAUS-MANAGED — same update rules as P5.
- `haus doctor`: checks root `CLAUDE.md` import block, validates both imported files exist + headers fresh, flags stale way-of-work hash.

### Deliverables

- `src/claude/write-root-claude-md.ts` — minimal-mode generator with managed-block parser.
- `src/claude/write-project-facts.ts` — renders `.haus-workflow/project.md`.
- `src/claude/write-way-of-work.ts` — copies template from catalog into `.haus-workflow/haus-way-of-work.md`.
- Template source in this repo (moves to catalog in P7): `library/templates/claude-md/haus-way-of-work.md`.
- Tests:
  - Creates all three files on fresh project.
  - Re-running `apply` produces zero diff outside markers.
  - User content above/below the import block preserved byte-for-byte.
  - User editing `haus-way-of-work.md` is detected via hash mismatch (skip-with-warn, same rule as P5).
  - `doctor` flags missing import block / stale template.
- Docs: `docs/generated-files.md`, `docs/user-guide.md` updated for new minimal-root model.
- `.claude/CLAUDE.md` writer: drop entirely (was old "compact secondary index"). Project-root `CLAUDE.md` is canonical.

### Acceptance

- Fresh project: `haus init` produces minimal root `CLAUDE.md` + populated `.haus-workflow/haus-way-of-work.md` + `.haus-workflow/project.md`.
- Pre-existing `CLAUDE.md` with user content: haus block appended once, user content unchanged across multiple `apply` runs.
- `doctor` reports OK when imports fresh, warns when template hash mismatched.

---

## P7 — Catalog repo split (revised)

**Why now.** P4 done, P5 defined install layout, P6 defined template format. Repo split before B4 fetch (P8) so B4 points at the new repo from day one.

### Deliverables

- New repo `wearehaustech/haus-workflow-catalog` (private initially, flip public in P9).
- **Move from this repo:**
  - `library/catalog/manifest.json`, `library/catalog/` items.
  - `library/haus/`, `library/templates/` (incl. P6 `haus-way-of-work.md`) — runtime-needed items only; CLI-internal stays.
  - **Outsourced skills** (re-homed in catalog, not removed entirely — user direction): `haus-context-router`, the old `haus-workflow` skill, `haus-global-engineering-rules`, `haus-skill-author`, `haus-documentation-maintainer`. These become catalog-distributed skills. Users who want them get them via `haus apply` selecting the catalog item; they are NOT seeded by `haus install` into `~/.claude/skills/`. (Or: catalog can opt them in for global install with a flag — decide during P7.)
- Tests fixtures: `tests/fixtures/catalog/` in CLI repo — tiny stable catalog goldens depend on. Decouple from production catalog.
- CLI changes:
  - `src/catalog/loader.ts` reads from `tests/fixtures/catalog/` in dev/test, cached remote (B4) in prod.
  - Constants: `CATALOG_REPO_URL = "https://raw.githubusercontent.com/wearehaustech/haus-workflow-catalog"`, `CATALOG_REF` default.
  - Way-of-work template loader points at catalog cache.
- Catalog repo CI: `npm install -g @haus-tech/haus-workflow@latest && haus validate-catalog ./manifest.json` on every PR.
- CLI repo CI: clone catalog head, run validator. Catches schema breakage from CLI side.
- Schema sync workflow: catalog `main` merge bumps `CATALOG_SCHEMA_VERSION` constant in CLI repo via PR (or re-runs CLI validator to alert on incompat).

### Acceptance

- CLI repo `yarn verify` green using fixture catalog.
- Catalog repo CI green using published CLI.
- Both-direction validation jobs proven by intentionally bad PR in each.
- `haus validate-catalog` documented.
- P6 way-of-work template lives in catalog; CLI fetches it via cache path.

---

## P8 — Remote fetch + self-sync (correlated, single PR)

**P8a — B4 remote catalog fetch**
- Implement design from `docs/specs/2026-05-22-b4-remote-catalog-design.md` against new catalog repo.
- Pinned ref: lockfile records commit SHA. `haus update` checks remote `main` head, prompts to bump.
- Offline fallback: cached catalog under `~/.claude/haus/catalog-cache/`.
- Auth: anonymous raw-URL fetch (catalog repo public after P9; design must not require auth).

**P8b — Self-sync (replaces old `haus plugin update`)**
- `haus update` does, in order:
  1. Check installed npm package version vs. latest on registry. If newer available, prompt the user to run `npm i -g @haus-tech/haus-workflow` (haus does not self-upgrade; it advises).
  2. After (any) package version change, re-run `haus install` to refresh `~/.claude/` haus files per P5 update semantics.
  3. Fetch latest catalog from `haus-workflow-catalog`, write cache, update lockfile.
  4. Re-render `.haus-workflow/haus-way-of-work.md` and `.haus-workflow/project.md` in current project (P6 generator).
- `haus doctor` reports:
  - npm package version + latest available.
  - `~/.claude/` haus install drift (any HAUS-MANAGED file whose hash diverges from current package).
  - Catalog cache age vs. remote head.

### Acceptance

- `haus update` against new catalog: cache + lockfile updated.
- Offline: cached catalog used, lockfile unchanged.
- `~/.claude/` re-sync touches only HAUS-MANAGED files; user content preserved.
- `haus doctor` flags an artificially-stale install correctly.

---

## P9 — Public + npm scope (correlated, single PR)

> **Gate.** Do not start P9 until P0–P8 merged, `yarn verify` green on `main`, P10 dry-run rehearsal passed locally, B4 cache works against a private catalog repo. Public flip is one-way enough to warrant a checklist gate.

**P9a — npm scope rename (code changes)**
- `package.json`:
  - `"name": "@haus-tech/haus-workflow"`
  - `"publishConfig": { "access": "public" }`
  - `"bin": { "haus": "./dist/cli.js" }`
  - `"repository"`, `"homepage"`, `"bugs"` → `wearehaustech/haus-workflow`
  - `"files"` allowlist (carry P4d in here if not done earlier). MUST include `library/global/**` so `haus install` finds source files.
- Update install docs everywhere (`docs/setup-guide.md`, `docs/user-guide.md`, README). All references to "Claude Code plugin" removed.
- Dry-run: `npm publish --dry-run` from clean checkout. Inspect tarball — must contain `library/global/skills/haus-workflow/`, `library/global/agents/haus-*.md`, `library/global/settings-fragments/hooks.json`, `dist/`, `package.json`, `README.md`. No `plugin/`. No `library/curated/`.

**P9b — Flip repos public**

In order, after the P9a PR is merged:

1. `wearehaustech/haus-workflow-catalog` → Settings → Danger Zone → Change visibility → Public.
2. `wearehaustech/haus-workflow` → same.
3. From a clean shell with no `gh auth`, verify anonymous fetch:
   ```bash
   curl -sSf https://raw.githubusercontent.com/wearehaustech/haus-workflow-catalog/main/manifest.json | jq .version
   ```
4. Add top-level README banner in both repos:
   > Internal Haus tool. Open-source but unsupported for external use. No external issues, PRs, or roadmap commitments accepted.

### Acceptance

- `curl` of catalog raw URL works without auth.
- `npm publish --dry-run` clean.
- All docs reference `@haus-tech/haus-workflow`; zero references to "plugin install" / "marketplace".

---

## P10 — Pre-publish gate + v0.1 release

> **Gate.** Do not publish to npm until P9 is fully merged and repos are public. Catalog repo MUST be reachable anonymously before v0.1, or first `haus update` hits auth failures.

**P10a — Pre-publish PR**
- Make `cleanup-status` CI job **blocking**. CI fails if spec non-empty. (Or: delete spec + script after confirming spec empty.)
- Confirm `package.json` `version` is `0.1.0`.
- Update `CHANGELOG.md` v0.1.0 entry — note the plugin→global-install pivot.
- Final manual audit:
  - `npm pack --dry-run` — inspect every file path in tarball.
  - `yarn verify` green.
  - `haus doctor` against three test projects.
  - Fresh `~/.claude/`: `npm i -g @haus-tech/haus-workflow` (from local tarball), `haus install`, verify HAUS-MANAGED files present and `settings.json` `_haus` block correct.
  - `haus uninstall` cleanly reverses.
  - End-to-end on fresh machine / container: `npm install -g @haus-tech/haus-workflow`, `haus install`, `haus init` on sample repo.

**P10b — Publish** — same release process as 2026-05-25 plan (reusable `scripts/release.sh` + `release.yml`). No changes to release machinery.

### Acceptance

- `npm view @haus-tech/haus-workflow` returns v0.1.0.
- Fresh machine: `npm install -g @haus-tech/haus-workflow`, `haus install`, `haus init` on sample repo — all green.
- Git tag `v0.1.0` pushed, GitHub release notes published.

---

## Release process

Unchanged from 2026-05-25 plan §"Release process" — `scripts/release.sh` + `.github/workflows/release.yml` with pinned action SHAs. Only difference: no plugin marketplace publish step (it never existed).

---

## When to make things public (gates)

| Event | Trigger | How |
|---|---|---|
| **Catalog repo public** | P9b step 1 | GitHub UI → Settings → Change visibility → Public. |
| **CLI repo public** | P9b step 2, after catalog | Same. |
| **First npm publish (v0.1.0)** | P10 all green, repos public, anonymous catalog fetch verified | `yarn release 0.1.0` from `main` |

Order matters: catalog public → CLI public → npm publish.

---

## Risks & open questions

- **`~/.claude/settings.json` merge robustness.** P5 assumes a `_haus` top-level key as ownership marker. Need to handle: malformed JSON, schema drift in user-added hooks, concurrent edits. Settle parsing strategy during P5 PR.
- **Stable-id naming policy.** P5 introduces `<stable-id>` per managed file. Decide policy (kebab-case dotted: `skill.haus-workflow`, `agent.haus-code-reviewer`, `hook.user-prompt-submit.context`). Must never change across versions.
- **Outsourced skills delivery model.** P7 outsources 5 skills to catalog. Decide whether the catalog can flag them for global install into `~/.claude/skills/` (extending `haus install`) or whether they only land in project `.claude/` via `haus apply`. Default: project-only (lower blast radius); revisit if user demand surfaces.
- **`haus install` over an existing competitive tool.** If another globally-installed CLI owns `~/.claude/agents/some-name.md` and our prefix collides (unlikely with `haus-*`), refuse with clear error.
- **CATALOG_SCHEMA_VERSION bump policy.** Carried over from prior plan — decide in P6/P7.
- **Hook config gating.** P2 audit may have flagged hooks as "gate-default-off". P5's settings-fragment installer must respect those gates: ship hooks but write them disabled, with a flag in `_haus` block to enable.
- **`library/haus/` and `library/templates/`.** Confirm during P7 split which subdirs are runtime data (move to catalog) vs CLI-internal (stay).

---

## Checklist

- [x] P0 — Repo rename to `haus-workflow`
- [x] P1 — Cleanup tracker tooling
- [x] P2 — Hook cost audit
- [x] P2b — `.haus-ai/` → `.haus-workflow/`
- [ ] P3 — Mark scaffolding (incl. `plugin/`)
- [ ] P4a — Remove sources subsystem
- [ ] P4b — Remove curation + library artifacts
- [ ] P4c — Collapse explainability + drop hooks
- [ ] P4d — npm tarball trim
- [ ] P4e — Delete `plugin/` directory; move surviving skills/agents to `library/global/`
- [ ] P5 — Global install layout (`haus install` / `haus uninstall`, HAUS-MANAGED markers, settings.json merge, `haus-workflow` all-in-one skill, 5 legacy skills dropped/outsourced)
- [ ] P6 — Minimal root `CLAUDE.md` with `@import` to managed `haus-way-of-work.md` + `project.md`
- [ ] P7 — Catalog repo split (incl. way-of-work template + outsourced skills)
- [ ] P8 — B4 remote fetch + `haus update` self-sync
- [ ] P9 — Public + npm scope
- [ ] P10 — Pre-publish gate + v0.1 release
