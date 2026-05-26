# Implementation Plan — Full-Scope v0.1

**Date:** 2026-05-25
**Status:** Draft
**Scope:** Execute the recommendations from the 2026-05-25 strategy review. One phase = one PR unless phases are explicitly marked as correlated and shipped together. Merge each PR to `main` before starting the next (per CLAUDE.md workflow rules — no stacking).

## Naming decisions (locked)

| Item | Name |
|---|---|
| CLI + plugin repo | `wearehaustech/haus-workflow` (renamed from `haus-ai-workflow`) |
| Catalog repo | `wearehaustech/haus-workflow-catalog` |
| npm package | `@haus-tech/haus-workflow` |
| Binary | `haus` |
| Plugin slash command prefix | `/haus-*` |

npm package name and `bin` name are independent — `@haus-tech/haus-workflow` with `bin: { "haus": "./dist/cli.js" }` is fully supported. No fallback needed.

## Outcome

At the end of this plan:

- Two public repos: `wearehaustech/haus-workflow` (CLI + plugin) and `wearehaustech/haus-workflow-catalog` (manifest + items).
- npm package `@haus-tech/haus-workflow` published as v0.1, public access, `bin: haus`.
- Plugin remains in this repo with global `/haus-*` slash commands, hardened against missing CLI.
- All process scaffolding (sources sync, curation audits, decision-validation, redundant explainability) removed from the runtime surface.
- B4 remote catalog fetch implemented against the new catalog repo.
- `haus init` / `haus apply` generate a project-root `CLAUDE.md` with managed `project` + `way-of-work` blocks; user content outside markers preserved.
- `haus plugin update` ships.
- Hook cost audited and gated.
- Cleanup tracker enforced by CI until removed at v0.1 publish.

---

## Phase order

```
P0 → P1 → P2 → P2b → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10
            ↑ P2 may run in parallel with P1 if a separate hand picks it up;
              otherwise sequential.
```

Correlated PRs (ship in one PR):
- **P5a + P5b** — plugin hook de-dup + plugin→CLI error handling
- **P8a + P8b** — B4 remote fetch + `haus plugin update`
- **P9a + P9b** — repo public + npm scope rename

---

## P0 — Repo rename

**Why first.** All later phases reference the new name. Doing this on its own minimises diff noise downstream.

**Steps** (GitHub-side, one sitting)
1. GitHub UI: Settings → rename `haus-ai-workflow` → `haus-workflow`. GitHub auto-creates redirect from old name.
2. Local: `git remote set-url origin git@github.com:wearehaustech/haus-workflow.git` (confirm org slug — `wearehaustech` if it differs).
3. Audit references: `rg -i "haus-ai-workflow" --hidden -g '!node_modules' -g '!dist'`. Update README, install docs, package.json `repository`, `homepage`, `bugs` fields, plugin metadata.
4. Update CLAUDE.md header line if it carries the old name.
5. Single PR: "chore: rename to haus-workflow".

**Acceptance**
- `rg haus-ai-workflow` returns zero hits outside of changelogs / historical specs.
- Old clone URL still works via redirect (test once, then everyone updates remote).

---

## P1 — Cleanup tracker tooling

**Why first.** Removals in P3/P4 need a tracker so the cleanup spec stays in sync without manual bookkeeping. Tracker must exist before markers are placed.

**Deliverables**
- `docs/specs/pre-release-cleanup.md` — checklist file, one row per item to remove or revisit before v0.1 publish.
- Marker convention: `// HAUS-PRERELEASE-CLEANUP: <one-line reason>` (also `# HAUS-PRERELEASE-CLEANUP:` for `.json`/`.md` where // is invalid — use `<!-- HAUS-PRERELEASE-CLEANUP: ... -->` in markdown).
- `scripts/cleanup-status.ts` — grep markers across `src/`, `tests/`, `scripts/`, `plugin/`, `library/`, `docs/`. Reconcile with the spec. Exit 0 always, print:
  - markers found with no spec row → "ADD to spec"
  - spec rows with no marker → "ORPHANED"
  - matching rows → "OK"
- `yarn cleanup:status` script in `package.json`.
- CI: non-blocking job `cleanup-status` in `.github/workflows/quality.yml`.
- Optional skill stub `plugin/skills/haus-cleanup-curator/` — thin wrapper that runs the script and helps draft the cleanup PR. Source of truth stays the script + spec.

**Acceptance**
- `yarn cleanup:status` runs clean on current `main` (zero markers, empty spec).
- CI job appears on PRs and reports.

---

## P2 — Hook cost audit

**Why now.** Independent of removals. Findings inform whether `guard bash` / `context --from-hook` survive P4 or get gated/dropped.

**Deliverables**
- `scripts/bench-hooks.ts` — time wall + count stdout tokens for: `haus guard bash --from-hook`, `haus context --from-hook`, `haus memory ingest --from-hook`.
- Report committed to `docs/specs/2026-05-25-hook-cost-report.md`.
- Decision row per hook: keep / gate-default-off / drop. Thresholds: drop or gate if >150ms wall or >300 stdout tokens per call without commensurate value.
- If gated: config flag in `.haus-workflow/config.json` (`hooks.guardBash.enabled`, etc.), read by the hook wrapper.

**Acceptance**
- Report committed.
- Any "gate" decisions wired into hook contract.
- Any "drop" decisions feed into P4 removal list.

---

## P2b — Rename `.haus-ai/` → `.haus-workflow/`

**Why now.** Brand consistency with the v0.1 naming locks (`haus-workflow` repo, `haus-workflow-catalog` repo, `@haus-tech/haus-workflow` package, `haus-workflow` plugin). The `.haus-ai/` directory written into user projects is the last `haus-ai` leftover. Better to flip before P3 marking starts — markers placed on `.haus-ai`-mentioning code would otherwise need re-locating. **No migration shim needed** — no users yet.

**Targets** (47 files touched, mechanical rename)
- `src/utils/paths.ts` — `HAUS_DIR = ".haus-ai"` → `".haus-workflow"`. Constant name stays.
- 12 other `src/` files referencing the directory literal in messages/paths.
- 10 tests + `tests/helpers/fixture-runner.js`.
- 3 scripts (`bench-hooks.ts`, `qa-batch.mjs`, `qa-pass.sh`).
- 3 plugin skill markdowns.
- 12 docs (architecture, cli, catalog, commands, validation, memory, user-guide, technical-guide, generated-files, updates, README, CLAUDE.md, hook-cost-report).
- `.gitignore` — `.haus-ai/` → `.haus-workflow/`.
- Historical specs (`docs/specs/2026-05-22-*.md`) intentionally retain `.haus-ai` as a historical record (mirrors P0 convention).

**Acceptance**
- `rg "\.haus-ai"` returns hits only in `docs/specs/2026-05-22-*.md`.
- `yarn verify` green (goldens unaffected — none reference the directory path).
- `haus init` in a fresh fixture produces a `.haus-workflow/` directory.

---

## P3 — Mark scaffolding

**Why now.** Use the P1 tracker to label every dev-only module before pulling it. Markers + spec entries land in the same PR. No code deleted yet — review surface stays small.

**Targets** (confirm during PR):
- `src/sources/{github,prpm,skillkit,skills-sh}-source.ts`, `source-audit.ts`, `source-report.ts`, `load-sources.ts`, `types.ts` — keep one minimal adapter if B4 fetch path needs it; mark the rest.
- `src/curation/unsupported-stack-mention.ts`
- `scripts/audit-sources.ts`, `validate-source-decisions.ts`, `audit-curated.ts`, `library-audit.ts`, `verify-no-unsupported-tech.ts`, `validate-findings.ts`
- `library/curated/` (audit reports, source decisions, external wrappers, references — process artifacts)
- `library/curation/` (if same character)
- Two of three explainability commands — pick the production one, mark the others.
- Tests guarding any of the above.
- Any P2 "drop" hook code.

**Deliverables**
- Markers in code + spec rows in `docs/specs/pre-release-cleanup.md`.
- `yarn cleanup:status` reports the full set as "OK".

**Acceptance**
- Spec rows + markers 1:1. CI tracker job green.

---

## P4 — Remove scaffolding

**Why now.** Markers placed, removals reviewable as one focused diff per cluster. May split into 2–3 PRs if the diff is too large; keep clusters self-contained.

**PR clusters (suggested split)**
- **P4a — sources subsystem.** Delete `src/sources/*` (minus the one B4 needs), tests, `scripts/audit-sources.ts`, `scripts/validate-source-decisions.ts`. Remove CLI command `haus sources *` unless one survives. Update `docs/external-sources.md`, `docs/curation.md`.
- **P4b — curation + library artifacts.** Delete `src/curation/`, `library/curated/`, `library/curation/`, `scripts/audit-curated.ts`, `scripts/library-audit.ts`, `scripts/verify-no-unsupported-tech.ts`, `scripts/validate-findings.ts`. Update `docs/curated-library.md`, `docs/curation.md`.
- **P4c — redundant explainability + dropped hooks.** Collapse explainability commands to one. Remove any P2-dropped hook code. Update `docs/commands.md`.
- **P4d (optional) — npm tarball trim.** Add `files:` allowlist in `package.json` so removed artifacts can't sneak back in. Verify `npm pack --dry-run`.

**Acceptance**
- `yarn verify` green.
- Spec rows for removed items deleted in same PR (tracker stays consistent).
- `npm pack --dry-run` shows no `library/curated`, no `src/sources/*` orphans, no `scripts/audit-*` in tarball.

---

## P5 — Plugin hardening (correlated, single PR)

**P5a — Hook de-duplication**
- Today: `plugin/hooks/hooks.json` and `src/claude/load-hooks.ts` define hooks in two places. Drift risk.
- Generate one from the other at build. Suggestion: source of truth = `src/claude/hook-contract.ts` (TS), `plugin/hooks/hooks.json` generated by a `prebuild` step in the plugin.

**P5b — Plugin → CLI coupling**
- Replace `|| true` silent fallback in plugin hook commands with a wrapper script that:
  - On missing `haus` binary: writes one-line stderr `haus CLI not found — install: <URL>`, exits 0.
  - On binary present: exec.
- Plugin load-time check (a `SessionStart` hook entry) writes the same notice once per session if missing.

**Acceptance**
- Edit `src/claude/hook-contract.ts` → `yarn build` → `plugin/hooks/hooks.json` regenerated. CI fails if generated file is stale.
- Manual test: rename `haus` binary, start a Claude Code session in a haus-applied repo. One notice appears, no broken hooks.

---

## P6 — Project root `CLAUDE.md` generator

**Why now.** Claude Code reads the **project root** `CLAUDE.md` as primary memory. Today `haus apply --write` only writes `.claude/CLAUDE.md` (non-canonical location). A real Haus-onboarded project needs a root `CLAUDE.md` that combines project-specific facts with the general Haus way-of-work block. Lands before catalog split so the template format is defined when P7 decides what content lives where.

**Behaviour**
- `haus init` and `haus apply --write` ensure `<project-root>/CLAUDE.md` exists with two parts:
  1. **Project-specific block** — auto-generated from the scanner output: detected stack, package manager, build/test/lint commands, repo structure summary, key paths.
  2. **Haus way-of-work block** — general Haus AI instructions (token discipline, context-routing expectations, security guardrails, commit/PR conventions, etc.). Same text across all Haus projects.
- Both blocks wrapped in HTML-comment markers so haus can update them without touching anything else:
  ```
  <!-- HAUS:BEGIN project -->
  ...auto-generated project facts...
  <!-- HAUS:END project -->

  <!-- HAUS:BEGIN way-of-work -->
  ...curated Haus instructions...
  <!-- HAUS:END way-of-work -->
  ```
- File creation policy:
  - File missing → create with both managed blocks + a top header.
  - File exists, markers present → update only inside markers. Diff + confirm on `apply`, silent on `init`.
  - File exists, no markers → append both blocks at end with a one-line note ("appended by haus"). Never modify user content outside markers.
- `haus update` re-renders both blocks (way-of-work content can change between catalog refreshes).
- `haus doctor` checks: root `CLAUDE.md` exists, both managed blocks present, way-of-work block matches the catalog version. Stale block = doctor warning.

**Deliverables**
- `src/claude/write-root-claude-md.ts` — generator with managed-block parser and writer.
- Template source: `library/templates/claude-md/way-of-work.md` (single source for the way-of-work block — moves into the catalog repo in P7).
- Project-block renderer reads `context-map.json` + `recommendation.json` + `repo-summary.md` to produce a compact, deterministic block. Cap length (suggestion: ≤80 lines, no per-file listings).
- Existing `.claude/CLAUDE.md` writer: decide one of (a) keep as compact secondary index that points to root `CLAUDE.md`, or (b) drop entirely. Default to (a) for now, revisit in P10 cleanup.
- Tests:
  - Creates root `CLAUDE.md` when missing.
  - Updates only inside markers when both blocks exist.
  - Appends blocks (with note) when file exists without markers.
  - Preserves user content outside markers across multiple `apply` runs.
  - `doctor` flags stale way-of-work block.
- Docs: update `docs/generated-files.md` and `docs/user-guide.md` to describe the root `CLAUDE.md` contract.

**Acceptance**
- Fresh project: `haus init` produces a root `CLAUDE.md` with both managed blocks populated.
- Project with pre-existing `CLAUDE.md`: user content preserved byte-for-byte outside markers; haus blocks updated inside markers.
- `haus doctor` reports OK when blocks fresh, warns when stale.
- Round-trip test: edit user content outside markers → run `haus update` → user content unchanged.

---

## P7 — Catalog repo split

**Why now.** P4 done, no dead weight to drag across. P6 defined the way-of-work template format. Repo split before B4 fetch (P8) so B4 points at the new repo from day one.

**Deliverables**
- New repo `wearehaustech/haus-workflow-catalog` (private initially, flip to public in P9).
- Move `library/catalog/manifest.json`, `library/catalog/` items, `library/haus/`, `library/templates/` (including the P6 `way-of-work.md`) — audit each: anything runtime-needed by the CLI moves; anything CLI-internal stays.
- Tests fixtures: create `tests/fixtures/catalog/` in CLI repo — tiny stable catalog the goldens depend on. Decouple goldens from production catalog.
- CLI changes:
  - `src/catalog/loader.ts` reads from `tests/fixtures/catalog/` in dev/test, from cached remote (B4) in prod. Stub the remote path until P8.
  - Config constant: `CATALOG_REPO_URL = "https://raw.githubusercontent.com/wearehaustech/haus-workflow-catalog"` and `CATALOG_REF` defaults.
  - Way-of-work template loader points at catalog cache.
- Catalog repo CI: `npm install -g @haus-tech/haus-workflow@latest && haus validate-catalog ./manifest.json` on every PR.
- CLI repo CI: clone catalog repo head, run validator. Catches schema breakage from CLI side.
- Schema sync workflow: catalog PR merge to `main` triggers a workflow that bumps a `CATALOG_SCHEMA_VERSION` constant in the CLI repo via PR (or just re-runs the validator on the CLI repo's `main` to alert on incompat).

**Acceptance**
- CLI repo `yarn verify` green using fixture catalog.
- Catalog repo CI green using published CLI.
- Both-direction validation jobs proven by intentionally bad PR in each (verify they fail).
- `haus validate-catalog` command exists and is documented.
- P6 way-of-work template lives in catalog; CLI fetches it via the cache path.

---

## P8 — Remote fetch + plugin update (correlated, single PR)

**P8a — B4 remote catalog fetch**
- Implement the design in `docs/specs/2026-05-22-b4-remote-catalog-design.md` against the new catalog repo.
- Pinned ref strategy: lockfile records commit SHA. `haus update` checks remote `main` head, prompts to bump.
- Offline fallback: cached catalog under `~/.haus-workflow/cache/`.
- Auth: anonymous raw-URL fetch (catalog repo is public after P8, but design must not require auth).

**P8b — `haus plugin update`**
- Locate plugin install dir (`~/.claude/plugins/.../` or wherever Claude Code marketplace put it).
- `git pull` if it's a git checkout; otherwise re-fetch via the install mechanism used at install time.
- Print reload instructions for Claude Code.
- `haus doctor` reports plugin version + staleness.

**Acceptance**
- `haus update` fetches latest catalog from `haus-workflow-catalog`, writes cache, updates lockfile.
- Offline: cached catalog used, lockfile unchanged.
- `haus plugin update` runs cleanly on a real plugin install.

---

## P9 — Public + npm scope (correlated, single PR)

> **Gate.** Do NOT start P9 until: P0–P8 merged, `yarn verify` green on `main`, P10 dry-run rehearsal passed locally, B4 cache works against a private catalog repo. Going public is one-way enough to warrant a checklist gate.

**P9a — npm scope rename (code changes)**
- `package.json`:
  - `"name": "@haus-tech/haus-workflow"`
  - `"publishConfig": { "access": "public" }`
  - `"bin": { "haus": "./dist/cli.js" }` (unchanged)
  - `"repository": { "type": "git", "url": "git+https://github.com/wearehaustech/haus-workflow.git" }`
  - `"homepage": "https://github.com/wearehaustech/haus-workflow"`
  - `"bugs": { "url": "https://github.com/wearehaustech/haus-workflow/issues" }`
  - `"files": [...]` allowlist (carry P4d in here if not done earlier)
- Update install docs everywhere (`docs/setup-guide.md`, `docs/user-guide.md`, plugin `marketplace.json`, README).
- Dry-run: `npm publish --dry-run` from clean checkout. Inspect tarball.

**P9b — Flip repos public (manual GitHub steps)**

Do these in order, after the P9a PR is merged:

1. `wearehaustech/haus-workflow-catalog` → Settings → Danger Zone → Change visibility → Public. Confirm phrase.
2. `wearehaustech/haus-workflow` → same.
3. From a clean shell with no `gh auth`, verify anonymous fetch:
   ```bash
   curl -sSf https://raw.githubusercontent.com/wearehaustech/haus-workflow-catalog/main/manifest.json | jq .version
   ```
4. Add a top-level README banner in both repos:
   > Internal Haus tool. Open-source but unsupported for external use. No external issues, PRs, or roadmap commitments accepted.

**Acceptance**
- `curl` of catalog raw URL works without auth.
- `npm publish --dry-run` clean.
- All docs reference `@haus-tech/haus-workflow`.

---

## P10 — Pre-publish gate + v0.1 release

> **Gate.** Do NOT publish to npm until P9 is fully merged and repos are public. The catalog repo MUST be reachable anonymously before v0.1, otherwise users hit auth failures on first `haus update`.

**P10a — Pre-publish PR**
- Make `cleanup-status` CI job **blocking**. If spec is non-empty, CI fails. (Or: delete spec + script entirely after confirming spec is empty.)
- Confirm `package.json` `version` is `0.1.0`.
- Add/update `CHANGELOG.md` v0.1.0 entry.
- Final manual audit:
  - `npm pack --dry-run` — inspect every file path in tarball.
  - `yarn verify` green.
  - `haus doctor` against three test projects (matrix per scanner targets).
  - Plugin install from fresh `~/.claude/` (delete and reinstall).
  - End-to-end on a fresh machine / container: `npm install -g @haus-tech/haus-workflow`, plugin install, `haus init` on sample repo.

**P10b — Publish (manual sequence, see "Release process" below)**

**Acceptance**
- `npm view @haus-tech/haus-workflow` returns v0.1.0.
- Fresh machine: `npm install -g @haus-tech/haus-workflow`, plugin install, `haus init` on a sample repo — all green.
- Git tag `v0.1.0` pushed, GitHub release notes published.

---

## Release process (reusable for every release)

Set up once during P9a, used every release thereafter.

### One-time setup (do during P9a PR)

1. **Create npm org** `haus-tech` at https://www.npmjs.com/org/create. Confirm org name available; if not, use the package name fallback `@haus-tech/haus` (still scoped to `haus-tech` org).
2. **Add maintainers** to npm org with publish rights. Use a shared bot account or named accounts with 2FA.
3. **npm 2FA**: require 2FA-for-publish at org level (`npm access 2fa-required @haus-tech/haus-workflow`).
4. **npm automation token**: create a granular access token scoped to `@haus-tech/haus-workflow`, publish-only. Add to GitHub repo secrets as `NPM_TOKEN`.
5. **Add release workflow** `.github/workflows/release.yml`. Pin actions to commit SHAs (repo convention, supply-chain hardening — mirror `ci.yml`). Node 22, Yarn 4 via Corepack:
   ```yaml
   name: release
   on:
     push:
       tags: ['v*.*.*']
   permissions:
     contents: read
   jobs:
     publish:
       runs-on: ubuntu-latest
       permissions:
         contents: write
         id-token: write
       steps:
         - name: Checkout
           uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
         - name: Setup Node
           uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
           with:
             node-version: "22"
             registry-url: "https://registry.npmjs.org"
         - name: Enable Corepack
           run: corepack enable
         - name: Install
           run: yarn install --immutable --check-cache
         - name: Verify
           run: yarn verify
         - name: Publish to npm
           run: npm publish --access public --provenance
           env:
             NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
         - name: Create GitHub release
           uses: softprops/action-gh-release@3bb12739c298aeb8a4eeaf626c5b8d85266b0e65 # v2
           with:
             generate_release_notes: true
   ```
   Re-resolve action SHAs at workflow-creation time (`gh api repos/<owner>/<repo>/git/refs/tags/<tag>`) — the SHAs above are pinned at plan-authoring time and may have moved.
6. **Add `scripts/release.sh`** that wraps the local-only steps so the human flow is one command:
   ```bash
   #!/usr/bin/env bash
   # Usage: ./scripts/release.sh 0.1.0
   set -euo pipefail
   version="$1"
   git diff --quiet || { echo "uncommitted changes"; exit 1; }
   [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "not on main"; exit 1; }
   git pull --ff-only
   yarn verify
   npm version "$version" --no-git-tag-version
   git add package.json
   git commit -m "chore(release): v$version"
   git tag "v$version"
   git push origin main
   git push origin "v$version"
   echo "Tag pushed. GitHub Actions will publish to npm and create the release."
   ```
   Add `"release": "./scripts/release.sh"` to `package.json` scripts.

### Every-release flow (after one-time setup)

> **Pre-flight (do these once, never skip)**
> - On `main`, working tree clean.
> - `yarn verify` green locally.
> - `CHANGELOG.md` updated with the version entry.
> - All target PRs merged.

```bash
yarn release 0.1.0          # bumps version, commits, tags, pushes
```

What happens automatically (GitHub Actions):
1. Pushes to tag `v0.1.0` trigger `release.yml`.
2. Workflow runs `yarn verify` again on CI.
3. `npm publish --access public --provenance` publishes to registry.
4. GitHub release is created with auto-generated notes.

What to verify after (do every time):
```bash
npm view @haus-tech/haus-workflow version          # should print 0.1.0
npm install -g @haus-tech/haus-workflow            # install from registry
haus --version                                     # should print 0.1.0
```

### Hotfix / patch release

Same flow, bump patch: `yarn release 0.1.1`. No special branch — fix on `main`, tag.

### Rollback

`npm unpublish` is only allowed within 72h and only if no dependents. Prefer:
```bash
npm deprecate @haus-tech/haus-workflow@0.1.0 "broken release, use 0.1.1"
```
Then publish a fixed `0.1.1` immediately.

---

## When to make things public (clear gates)

| Event | Trigger | How |
|---|---|---|
| **Catalog repo public** | P9b step 1 | GitHub UI → Settings → Change visibility → Public. Type the confirmation phrase. |
| **CLI/plugin repo public** | P9b step 2, after catalog | Same UI step. |
| **First npm publish (v0.1.0)** | P10 acceptance criteria all green, repos already public, anonymous catalog fetch verified | `yarn release 0.1.0` from `main` |

**Order matters**: catalog public → CLI public → first npm publish. Do not skip the order; an installed CLI without a reachable catalog fails on `haus update`.

---

## Risks & open questions

- ~~**GitHub org slug.** Plan assumes `wearehaustech`.~~ Confirmed (`WeAreHausTech` displayed, slug `wearehaustech`).
- ~~**npm org availability.** Plan assumes `haus-tech` org name is free on npmjs.com.~~ Confirmed — org already owned by Haus on npm.
- **`library/haus/` and `library/templates/`.** Confirm during P6 whether these are runtime data (move to catalog) or CLI-internal (stay).
- **Plugin version coupling.** P7b assumes plugin is installable as a git checkout. If Claude Code marketplace install model differs, adjust.
- **Schema versioning policy.** P6 introduces `CATALOG_SCHEMA_VERSION` but the bump policy (semver? integer?) is TBD. Decide in P6.
- **Hook config flag location.** P2 assumes `.haus-workflow/config.json`. Confirm this file exists or create it in P2.

---

## Checklist (track here as phases land)

- [x] P0 — Repo rename to `haus-workflow`
- [x] P1 — Cleanup tracker tooling
- [x] P2 — Hook cost audit
- [x] P2b — Rename `.haus-ai/` → `.haus-workflow/`
- [ ] P3 — Mark scaffolding
- [ ] P4a — Remove sources subsystem
- [ ] P4b — Remove curation + library artifacts
- [ ] P4c — Collapse explainability + drop hooks
- [ ] P4d — npm tarball trim (optional)
- [ ] P5 — Plugin hardening (de-dup + coupling)
- [ ] P6 — Project root `CLAUDE.md` generator
- [ ] P7 — Catalog repo split
- [ ] P8 — Remote fetch + plugin update
- [ ] P9 — Public + npm scope
- [ ] P10 — Pre-publish gate + v0.1 release
