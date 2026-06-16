# Deep Audit Report & Execution Plan — 2026-06-16

Audited by: Claude Opus 4.8 (9 parallel subagents + main-thread cross-verification) and follow-up audit (2026-06-16)
Repos: `haus-workflow` @ `ed59c5f` (v0.27.0) · `haus-workflow-catalog` @ `618de32` (v2.7.2)
Status: **Open** — no fixes applied; all findings are pre-implementation
Decisions recorded: 2026-06-16 by Aniisa Bihi

---

## Locked policy decisions (2026-06-16)

| #   | Question                       | Decision                                              | Plan impact                                                                                                                                                              |
| --- | ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Catalog ref policy             | **Release tag** is canonical                          | Runtime, bundled fixtures, `contract-check`, and fixture-sync all track **latest catalog release tag**; `main` is dev preview only; `HAUS_CATALOG_REF` for pinning/tests |
| 2   | Contract strictness on PR      | **Advisory** (keep)                                   | `contract-check.mjs` warns + exit 0 on PR; strict fail on `main` push / cron                                                                                             |
| 3   | Validator strategy             | **Unify into shared module**                          | Extract `validate-core` in catalog; thin `validate.mjs` + `haus validate-catalog` both call it; sync to CLI like `validation-rules.json`                                 |
| 4   | `rule` catalog type            | **Remove**                                            | Drop from schemas, CLI types, tests; write ADR (T13)                                                                                                                     |
| 5   | `HAUS_WORKFLOW_DISPATCH_TOKEN` | **Exists** in catalog repo secrets; open to safer ops | Implement pull-based fixture sync in CLI repo (T35–T37); retire PAT after stable                                                                                         |
| 6   | Curated executables in catalog | **Acceptable risk**                                   | No removal; optional runbook note only                                                                                                                                   |

**Release-tag implication:** `main` can be ahead of what consumers and bundled fixtures see until the next catalog release. Fixture sync must curl `refs/tags/vX.Y.Z/...`, not `.../main/...`.

---

## Phased execution order

Work in this order. Each phase: branch off `main`, TDD where noted, `yarn verify` (both repos when touched). No stacking.

| Phase                           | Scope                         | Tasks                       |
| ------------------------------- | ----------------------------- | --------------------------- |
| **P0 — Policy alignment**       | Docs + ref policy             | T7, T17, T26, T31, T32, T33 |
| **P1 — Unified validator**      | Shared validation core        | T34                         |
| **P2 — Remove `rule` type**     | Schema + types                | T13                         |
| **P3 — Safer fixture-sync ops** | Pull-based sync; retire PAT   | T35, T36, T37               |
| **P4 — Critical path**          | Data-loss / security          | T1–T5                       |
| **P5 — Robustness + DX**        | Atomic writes, hooks, imports | T6, T8–T16, T18–T23         |
| **P6 — Cleanup**                | Deps, comments, CI nits       | T24, T25, T27–T30           |

---

## Execution Checklist

Work items ordered by risk/priority. Each task: branch off `main`, write test first (TDD), implement, `yarn verify`. No stacking.

### Critical Path (data-loss / crash / security)

- [ ] **T1** — Harden manifest boundary (REC-1): validate `tags`/`repoRoles`/`requiresAny` array types in `parseManifest`; **reject whole manifest** (return `ok:false`) on any bad item; add regression test
- [ ] **T2** — No silent settings clobber (CLA-10): distinguish ENOENT vs parse-error in `readJson`; refuse overwrite + backup malformed settings.json
- [ ] **T3** — Anchor sensitive-path guard (CMD-2): replace substring match with basename/segment match + normalize; share regex set with scanner
- [ ] **T4** — Close missing-hash tamper hole (CLA-1 / TST-1): treat absent `hash=` as un-verifiable → skip+warn unless `--force`; add test
- [ ] **T5** — Per-command hook merge/strip (CLA-3 / CLA-4): filter at `entry.hooks[]` level for both `reconcileRetiredHausHooks` and `stripHausHooks`

### Robustness

- [ ] **T6** — Atomic writes (CLA-5): temp-file + `fs.rename` in `writeJson`/`writeText`; prioritise settings.json and lockfile
- [ ] **T7** — Align catalog ref policy to **tag everywhere** (INT-1): update `sync-catalog-fixture.yml` and `contract-check.mjs` to resolve the same latest-tag as runtime fetch; document in README/ADR
- [ ] **T8** — Fix `reconcileRetiredHausHooks` manifest hook dedup (CLA-6): `[...new Set([...(existingManifest?.hooks ?? []), ...addedIds])]` in `apply.ts:251`
- [ ] **T9** — Guard bash: add missing aliases (CMD-3): add `git push -f`, `git push --force-with-lease` to `DENY_COMMANDS`; anchor `sudo` to command start

### DX / Correctness

- [ ] **T10** — Fix cross-command imports (CMD-1): move `refreshProjectApply`/`isHausProject` out of `apply.ts` into a shared core module; fix `update.ts` and `init.ts` imports
- [ ] **T11** — Undo backup before removal (CMD-4): copy managed files to `.haus-workflow/backups/undo-<ts>/` before `fs.remove`
- [ ] **T12** — Fix `doctor` exit code (CMD-7): "newer version available" → advisory only (exit 0); align all `flag()` calls to consistent exit policy
- [ ] **T13** — **Remove** `rule` type (INT-4 / REC-2): delete `'rule'` from `CatalogItem.type` union (`src/types.ts`), from `KNOWN_ITEM_TYPES` check comment (`remote-catalog.ts`); coordinate removal from repo B `schema/catalog-item.schema.json` enum; write ADR
- [ ] **T14** — Consolidate HAUS-MANAGED header parsers (CLA-7): single parser shared by `header.ts` and `managed-template.ts`
- [ ] **T15** — Fix unbalanced sentinel handling in `write-root-claude-md.ts` (CLA-8): anchor sentinel search to line-start; detect/repair lone-BEGIN state
- [ ] **T16** — Normalize URL owner casing (INT-2): `wearehaustech` → `WeAreHausTech` in `constants.ts:8`
- [ ] **T17** — Semver-sort `fetchLatestCatalogTag` (INT-3): sort by semver, pick max valid `vX.Y.Z`, ignore non-semver tags

### Test Gaps

- [ ] **T18** — Add missing-hash tamper test (TST-1) — _covered by T4 if done together_
- [ ] **T19** — Add malformed-settings merge test (TST-2) — _covered by T2 if done together_
- [ ] **T20** — Add guard evasion characterization tests (TST-3): `SUDO`, `npm  publish`, `git push -f`
- [ ] **T21** — Add `npm-version.ts` / `diff-generated-files.ts` unit tests (TST-4): stub fetch; assert newer/equal/older/network-fail
- [ ] **T22** — Add `readWorkflowTemplate` / `getCacheManifestAge` / `fetchLatestCatalogTag` unit tests (TST-5)
- [ ] **T23** — Move tamper/lockfile tests out of `SLOW_INTEGRATION` in `test-fast.mjs` (TST-6): `lockfile`, `doctor-tamper`, `write-workflow`, `write-workflow-force`, `hash-installed`, `managed-template-version`

### Cleanup / Docs

- [ ] **T24** — Remove unused `ignore` dep (CI-1): `yarn remove ignore`; confirm `yarn build && yarn test` green
- [ ] **T25** — Remove stray `// test` comment from `versions.ts:40` (CMD-9)
- [ ] **T26** — Fix documentation accuracy (DOC-1..7 + CLA-2 contract doc):
  - `CLAUDE.md:27` "71 items" → "79 items"
  - `docs/architecture.md:121` "v2.5.0 / 71 items" → "v2.7.2 / 79 items" (or remove hardcoded count)
  - `README.md:82` fetch-from-`main` → fetch-from-latest-release-tag (+ `main` fallback)
  - `docs/security.md:91` "scoring flow" → "binary eligibility"
  - `docs/architecture.md:23` remove nonexistent `src/library/` row
  - `docs/cli.md:33` add `apply --force` flag
  - `docs/cli.md:115-121` document `workspace discover`, `workspace setup`, `workspace doctor`
  - `docs/security.md` (or `apply --help`): document that haus hooks are always re-enforced on `apply` — users cannot opt out (CLA-2 decision)
- [ ] **T27** — Fix `qa-batch.mjs:9` Windows-unsafe `URL().pathname` → `fileURLToPath(import.meta.url)` (CI-3)
- [ ] **T28** — Repo B: add `ecosystem` field to `haus.lefthook-security` item OR add `validate.mjs` non-default enforcement (CAT-1)
- [ ] **T29** — Add `$comment` to `schema/haus-lock.schema.json` noting downstream ownership (CAT-2)
- [ ] **T30** — Move misplaced comment in `ci.yml:81` to above `pack-smoke:` (line 104) (CI-2)

### Policy alignment (P0 — release tag + docs)

- [ ] **T31** — Fixture sync fetches from **release tag**, not `main`: update `haus-workflow/.github/workflows/sync-catalog-fixture.yml` to resolve latest catalog tag (same logic as `fetchLatestCatalogTag`) and curl `refs/tags/<tag>/manifest.json` + `validation-rules.json`
- [ ] **T32** — Catalog dispatch trigger on **tag push** `v*.*.*` (or release workflow step), not `push main` on manifest paths — align `haus-workflow-catalog/.github/workflows/dispatch-fixture-sync.yml` with release-tag policy
- [ ] **T33** — `contract-check.mjs`: default `HAUS_CATALOG_REF` → latest release tag (semver-sorted); fallback `main` only when no tags; keep PR advisory (decision #2)

### Unified validator (P1 — decision #3)

- [ ] **T34** — Extract shared validation core:
  - Create `haus-workflow-catalog/scripts/validate-core.mjs` (AJV schema, `isSafeCatalogPath`, semver, structure audits — move from `validate.mjs`)
  - Thin `validate.mjs` to import + run core only
  - Sync core to `haus-workflow/src/catalog/validate-core.ts` (or `.mjs` loader pattern matching `validation-rules`)
  - Refactor `src/commands/validate-catalog.ts` to delegate to core; delete duplicated audit functions
  - Parity tests: path traversal (`../evil`), bad semver, missing required fields — same failures from `yarn validate` and `haus validate-catalog`
  - Update `catalog/README.md` + `CHANGELOG.md`: CI uses `validate.mjs`; CLI command = same core

### Safer fixture-sync ops (P3 — decision #5)

- [ ] **T35** — Add pull-based workflow `haus-workflow/.github/workflows/sync-catalog-from-release.yml`: on cron + `workflow_dispatch`, resolve latest catalog tag → diff `library/catalog/*` → open/update PR (reuse sync job logic from `sync-catalog-fixture.yml`)
- [ ] **T36** — Demote catalog `dispatch-fixture-sync.yml` to optional backup (tag push only) or remove after T35 is green in production
- [ ] **T37** — Runbook: document pull-based sync + manual `workflow_dispatch`; after T35 stable, remove `HAUS_WORKFLOW_DISPATCH_TOKEN` from catalog secrets

### Additional doc fixes (from follow-up audit)

- [ ] **T38** — Remove dead `haus.memory-conventions` references (`README.md:75`, `docs/architecture.md:128`, `docs/cli.md:99`); point to Claude Code native `MEMORY.md` only
- [ ] **T39** — Fix stale comments: `src/types.ts:60`, `haus-workflow-catalog/scripts/validate.mjs:18` — drop `EXECUTION-PLAN.md` refs; point to ADR-0001 / schema path
- [ ] **T40** — Fix `haus-workflow-catalog/CHANGELOG.md` claim that `release.yml` uses `haus validate-catalog` — actual step is `node scripts/validate.mjs` (or switch release workflow after T34)

---

## 1. Executive Summary

**Overall health: Strong.** Both repos are well-structured, well-tested (75 test files in repo A, 27 in repo B), CI is green, fixtures are byte-identical across repos, and the catalog has zero orphans in either direction. Findings are refinements, not rescues.

**Highest-risk issues (all verified against source):**

| Rank | ID             | Severity | One-line                                                                                                                                               |
| ---- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | REC-1          | High     | Untrusted remote manifest crashes the **entire** recommend pass if any item omits `tags`/`repoRoles` (no per-item guard, no schema check).             |
| 2    | CLA-10 / TST-2 | High     | A malformed (not missing) `settings.json` silently read as `{}`, then **overwritten wholesale** — total loss of user permissions/hooks.                |
| 3    | CMD-2          | High     | `guardFileAccess` naive substring match: over-blocks (`src/secretstore/…` blocked by `secrets`) and weaker/inconsistent vs scanner's anchored regexes. |
| 4    | CLA-1 / TST-1  | High     | WORKFLOW.md with a HAUS-MANAGED header but **no `hash=`** bypasses tamper detection and is silently overwritten without `--force`.                     |
| 5    | CLA-3 / CLA-4  | Medium   | Multi-command hook entries mishandled on merge (drops user's co-located command) and on uninstall (only inspects `hooks[0]`).                          |
| 6    | CLA-5          | Medium   | All writes non-atomic; crash mid-write corrupts `settings.json`/lockfile/WORKFLOW.md.                                                                  |
| 7    | INT-1          | Medium   | Runtime fetches latest **tag**; fixture-sync + contract-drift track **main** → spurious red CI between catalog merge and release.                      |
| 8    | VAL-1          | High     | `haus validate-catalog` weaker than `scripts/validate.mjs` — no AJV schema, no path-traversal check, no per-item semver.                               |
| 9    | DOC-8          | Medium   | `haus.memory-conventions` referenced in docs but removed from catalog manifest.                                                                        |

**Verified at audit time:** `yarn verify` 462/462 pass; catalog `yarn validate && yarn test` 27/27 pass; `contract-check.mjs` PASS vs live `main` (v2.7.2 / 79 items); bundled manifest + validation-rules byte-identical to catalog repo.

## 2. Audit Scope

**Repos audited:**

- Repo A: `haus-workflow` @ `ed59c5f` (v0.27.0)
- Repo B: `haus-workflow-catalog` @ `618de32` (v2.7.2)

**Paths inspected (line-level via 9 parallel subagents + main-thread verification):**

- A: all `src/**` (~8.5k LOC), all `scripts/**`, `.github/workflows/**` (4 files), all configs, all `docs/**` (incl. 7 ADRs). Test-to-source coverage mapped across 75 test files.
- B: `manifest.json` (79 items), `validation-rules.json`, `sources.yaml`, `schema/**`, `scripts/**`, `.github/workflows/**`, content dirs cross-checked against manifest.
- Combined: fixture parity (byte-diff), schema/type alignment, ref resolution, dispatch↔sync workflow handshake.

**Main-thread re-verification (read directly):** `manifest-schema.ts`, `recommend.ts:75-199`, `write-workflow.ts:55-99`, `utils/fs.ts`, `guard-file-access.ts`. All four top findings confirmed against actual code.

**Files NOT inspected / limitations:**

- `tests/**` mapped for coverage, not line-audited for internal bugs
- Repo B skill/agent/command prose content — structure-only spot-check (~15 items)
- `gitleaks` not executed (binary absent) — config validated structurally only
- `HAUS_WORKFLOW_DISPATCH_TOKEN` validated by name/wiring, not live trigger
- Runtime GitHub fetch not executed live
- `node_modules`, `dist/`, `coverage/`, `.tsbuildinfo`, `yarn.lock` — not audited

---

## 3. System Inventory

**Repo A (`haus-workflow`) — the CLI.**
Entry: `dist/cli.js` (bin `haus`) ← `src/cli.ts`. Flow: CLI → `src/commands/*` (thin handlers) → core (`scanner/`, `recommender/`, `catalog/`, `claude/`, `install/`, `update/`) → output to `.haus-workflow/*.json` and `.claude/*`. Subcommands: `scan, recommend, apply, doctor, update, install, clone, catalog-audit, guard {file-access,bash}, workspace {init,scan,discover,setup,doctor}`. Tests: Node test runner, 75 files. CI: `ci.yml`, `contract-drift.yml`, `release.yml`, `sync-catalog-fixture.yml`. Runtime deps: 9 (commander, execa, fast-glob, fs-extra, semver, yaml, diff, @inquirer/checkbox, **ignore** [unused — T24]).

**Repo B (`haus-workflow-catalog`) — content.**
Hand-maintained `manifest.json` (79 items: 60 skill / 11 agent / 6 command / 2 template; 46 haus / 33 curated), `validation-rules.json`, `sources.yaml`, `schema/` (catalog-item, manifest, haus-lock). Content under `skills/`, `agents/`, `commands/`, `templates/`. CI dispatches `sync-catalog-fixture` to repo A on push to `main`.

**`haus` workflow system.**
`.claude/WORKFLOW.md` (methodology) + `workflow-config.md` (project values) injected via CLAUDE.md `@`-imports. Managed blocks marked `<!-- HAUS-MANAGED … hash=sha256-… -->`; tamper detection in `write-workflow.ts`/`managed-template.ts`; settings enforcement via `settings-merge.ts`; lockfile drift via `update/lockfile.ts`.

---

## 4. Repo A Findings

### REC-1 · High · bug/boundary-validation

**Files:** `src/catalog/manifest-schema.ts:54-82` + `src/recommender/recommend.ts:85,153,156`
**Evidence:** `parseManifest` validates `id`, `type`, `path` (and `reviewStatus`/`riskLevel` for curated) then `items.push(raw as CatalogItem)` — never validates `tags` or `repoRoles`. `recommend()` does `item.tags.join(' ')` (L85), `item.repoRoles.find(...)` (L153), `item.tags.find(...)` (L156) inside a `for…of` loop with **no per-item try/catch**.
**Impact:** Remote manifest item missing `tags`/`repoRoles` or sending them non-array throws `TypeError` and crashes the entire recommend pass — every downstream user on that catalog version gets zero recommendations.
**Fix (T1):** In `parseManifest`, after path check: `if (!Array.isArray(item.tags)) return {ok:false,error:\`${item.id}: tags must be an array\`}`— same for`repoRoles`. Validate at boundary, not downstream.
**Verify:** Feed manifest item with `tags`omitted /`tags:"x"`→ expect`ok:false`. Recommend test with such item asserts no throw. `yarn test`.

### CLA-10 · High · bug/data-loss

**Files:** `src/utils/fs.ts:10-16` → `settings-merge.ts` → `merge-project-settings.ts`
**Evidence:** `readJson` catches **all** errors and returns `undefined` — ENOENT and JSON-parse-error are indistinguishable. Merge starts from `{}` and `applyProjectSettingsMerge` rewrites the file.
**Impact:** Single stray comma in user's `settings.json` → silently read as empty → file overwritten, dropping every user permission/hook. Violates "NEVER encode ambiguity silently."
**Fix (T2):** Distinguish ENOENT (return `undefined`) from parse error (throw or discriminated result). Merge path refuses to overwrite existing-but-malformed settings; backs up instead.
**Verify:** Write `{ invalid` to `.claude/settings.json`, run `apply --write`, assert refuse/backup rather than rewrite.

### CMD-2 · High · security/detection-gap

**Files:** `src/security/guard-file-access.ts:12` + `sensitive-paths.ts`
**Evidence (verified directly):** `DENY_PATHS.find((token) => candidate.includes(token.replace(/\*/g, '')))` — raw substring, no normalization. Over-blocks `src/secretstore/util.ts`; under-matches vs scanner's anchored regexes.
**Fix (T3):** Basename/segment match: `*.ext` tokens → `basename.endsWith('.ext')`; dir tokens → `path.normalize(candidate).split('/').includes(token)`. Share one regex set with scanner.
**Verify:** `guardFileAccess('src/secretstore/x.ts')` → `undefined`; `guardFileAccess('config/id_rsa')` → blocked.

### CLA-1 · High · bug/tamper-bypass

**Files:** `src/claude/write-workflow.ts:75`
**Evidence (verified directly):** `if (parsed.hash && hashText(normaliseLF(existingContent)) !== parsed.hash && !force)` — guard only runs when `parsed.hash` truthy. A header without `hash=` → `parsed.hash` is `undefined` → bypass.
**Impact:** WORKFLOW.md with valid `id`/`v` header but no `hash=` (older haus or hand-stripped) is overwritten without `--force` — silent loss of user edits to a protected file.
**Fix (T4):** When `parsed.hash` is absent, treat as un-verifiable: `warn()` + skip unless `--force`.
**Verify:** Pre-write header without `hash=` + modified body, run `apply --write`, assert body preserved or warned.

### CLA-3 · Medium · bug/data-loss

**Files:** `src/install/settings-merge.ts:113-116`
**Evidence:** `!cmds.some(cmd => retiredCommands.has(cmd))` — drops the whole hook entry if any one command is retired. User command co-located in the same entry is deleted with it.
**Fix (T5):** Filter at `entry.hooks[]` level — drop only retired commands, keep entry if user commands remain.
**Verify:** Entry `[{command:'haus context --from-hook'},{command:'my-hook'}]` → `my-hook` survives.

### CLA-4 · Medium · bug/incomplete-uninstall

**Files:** `src/install/settings-merge.ts:377-380`
**Evidence:** `stripHausHooks` decides keep/drop from `entry.hooks[0]?.command` only. Multi-command entries: haus hook in position ≥1 leaks; user hook in position ≥1 lost.
**Fix (T5):** Iterate all `entry.hooks`, partition per-command, keep entry with non-haus commands only.
**Verify:** Uninstall over 2-command entry in each ordering; assert correct partition.

### CLA-5 · Medium · reliability

**Files:** `src/utils/fs.ts:21,46` (all writers)
**Evidence (verified directly):** `writeJson`/`writeText` call `fs.writeFile` directly — no temp-file+rename.
**Impact:** Crash mid-write → truncated file. Combined with CLA-10's swallow-and-default-to-`{}`, truncated settings.json silently drops all user config next run.
**Fix (T6):** Write to `${file}.tmp` then `fs.rename`. Prioritise `settings.json` + lockfile.

### CMD-1 · Medium · convention-violation

**Files:** `src/commands/update.ts:13`, `src/commands/init.ts:8`
**Evidence:** CLAUDE.md: "thin handlers only; never import across command files." `update.ts` imports `refreshProjectApply` from `./apply.js`; `init.ts` imports from `./setup-project.js`. (`setup-project→setup-core` defensible as the sanctioned core.)
**Fix (T10):** Move `refreshProjectApply`/`isHausProject` into a shared core module (`src/claude/` or `src/install/`).
**Verify:** `grep -rn "from './\(apply\|setup-project\|doctor\|undo\)\.js'" src/commands/*.ts` → empty. `yarn verify`.

### CMD-3 · Medium · security

**Files:** `src/security/guard-bash.ts:12` + `dangerous-commands.ts`
**Evidence:** `command.includes(token)` — `git push -f` not in `DENY_COMMANDS` (it IS in settings deny-list → runtime guard weaker than documented).
**Fix (T9):** Add `git push -f`, `git push --force-with-lease`; anchor `sudo` to command start.
**Verify:** `guardBash('git push -f origin main')` → blocked.

### CMD-4 · Medium · data-loss

**Files:** `src/commands/undo.ts:128-138`
**Evidence:** `runUndo` does `fs.remove(abs)` with no backup; `applyLock` creates backups — asymmetric.
**Fix (T11):** Copy targets to `.haus-workflow/backups/undo-<ts>/` before removal.
**Verify:** Hand-edit managed file, `haus undo -y`, assert backup exists.

### CLA-2 · Medium · UX — **DECIDED: intended contract, document it**

**Files:** `src/install/settings-merge.ts:159-180`, `docs/security.md`, `docs/runbook.md`
**Evidence:** `mergeHooks` re-adds a haus hook a user intentionally deleted — no "opted-out" memory.
**Decision (2026-06-16):** Intended behavior. Haus hooks are a hard contract enforced on every `apply`.
**Fix:** Document this contract explicitly in `docs/security.md` and/or CLI `apply --help` output. No code change. Add to T26 doc task scope.

### CMD-7 · Low · DX/exit-code · `src/commands/doctor.ts:223-233`

`haus doctor` exits 1 for "newer version available" (a normal state). Fix (T12): exit 0; document flag→exit policy consistently.

### CLA-6 · Low · bug/idempotency · `src/install/apply.ts:251`

`addedIds` appended to manifest hooks with no dedup. Fix (T8): `[...new Set([...(existingManifest?.hooks ?? []), ...addedIds])]`.

### CLA-7 · Low · maintainability

Two divergent HAUS-MANAGED parsers (`header.ts` vs `managed-template.ts`) — different grammars, different optionality. Fix (T14): consolidate.

### CLA-8 · Low · bug/data-integrity · `src/claude/write-root-claude-md.ts:34,43`

Unanchored `indexOf` for BEGIN/END sentinels: false match inside fenced code; lone BEGIN (deleted END) appends a second block, next run eats content. Fix (T15): anchor to line-start; detect unbalanced state.

### CLA-9 · Low · EOL · `src/claude/write-workflow-config.ts:104-114`

CRLF files get mixed EOL after refill (`split('\n')` keeps `\r`, replacement lines are LF-clean). Fix: normalize EOL on read.

### CMD-6 · Low · swallowed-errors

`readJson` (all callers), `render.ts:33` catch silently downgrade corruption to "absent" — misleading doctor/update output. Partially addressed by T2; audit remaining callers.

### CMD-8 · Low-Med · security · `src/commands/clone.ts:86`

`git clone url` with no protocol allowlist — `ext::sh -c …` = arbitrary command exec if ever driven by untrusted manifest. Fix: `GIT_ALLOW_PROTOCOL=https:ssh:git` in `cloneEnv()`.

### CMD-9 · Cleanup · `src/utils/versions.ts:40`

Stray `// test` comment. Fix (T25): delete.

### CLA-11 · Cleanup · `src/claude/write-claude-files.ts:311`

`!isCurated || !manifestItem` — second disjunct unreachable when `isCurated` is true. Simplify to `!isCurated`.

### CLA-12 · Cleanup · `src/install/apply.ts:69,94-120`

Sync FS (`fs.readFileSync`, `readdirSync`) in async pipeline. Use async variants.

### VAL-1 · High · validation-parity · `src/commands/validate-catalog.ts` vs `catalog/scripts/validate.mjs`

**Evidence:** Catalog CI runs `validate.mjs` with AJV (`validateCatalogItem`, `validateManifest`), `isSafeCatalogPath()`, semver checks. CLI `validate-catalog` duplicates partial logic — no path traversal, no AJV, no per-item semver. README/CHANGELOG claim CLI parity; release workflow still uses `validate.mjs`.
**Impact:** `haus validate-catalog` gives false confidence if used as alternate validator.
**Fix (T34):** Extract `validate-core.mjs`; both entry points call it; sync to CLI per ADR-0001 pattern.
**Verify:** Inject manifest with `path: "../evil"` → both validators fail identically.

### A-003 · Medium · runtime-ingest-gap · `src/catalog/manifest-schema.ts`

**Evidence:** `parseManifest()` does not require `version`, `tags`, `tokenEstimate`, `title`; accepts extra fields (no `additionalProperties: false`).
**Impact:** Weaker ingest than catalog schema; mitigated by trusted source + `validateCatalogItem()` on content.
**Fix:** Align `parseManifest()` with `catalog-item.schema.json` required set (can fold into T1 boundary hardening).
**Verify:** Unit test minimal invalid item at ingest boundary.

### A-005 · Cleanup · unused `ignore` dep

Covered by T24.

---

## 5. Repo B Findings

### CAT-1 · Low · schema-enforcement-gap

**Files:** `schema/catalog-item.schema.json:132-135` + `manifest.json`
**Evidence:** `ecosystem` documented "Required for all non-default items" — NOT in schema `required[]`. `haus.lefthook-security` (`default:false`, no `ecosystem`) passes `validate.mjs`.
**Impact:** Recommender's cross-item conflict detection silently skips that item.
**Fix (T28):** Add `ecosystem` to the item, or add non-default enforcement in `validate.mjs`.
**Verify:** `node -e 'const m=require("./manifest.json");console.log(m.items.filter(i=>i.default!==true&&!i.ecosystem).map(i=>i.id))'` → `[]`.

### CAT-2 · Info · orphan-schema · `schema/haus-lock.schema.json`

Validated by nothing in this repo. Not a defect (downstream contract). Add `$comment` noting ownership (T29).

### CAT-3 · Info · unused-enum-headroom

`type: rule` (0 items), `installMode: plugin-only` (0 items), unused `reviewStatus`/`riskLevel` values. Forward-compatible — not defects. See INT-4.

**Verified clean:** 0 orphan manifest entries, 0 orphan content files, no duplicate ids/paths, all 60 skills have non-empty `description:` frontmatter, CI gate (validate + test + lint + format) passes locally.

### B-005 · Medium · misleading README · `README.md:44`

**Evidence:** "catalog items are not bundled into the npm package" — true for skill bodies, but understates that `manifest.json` + `validation-rules.json` ship in `library/catalog/` as offline fallback.
**Fix:** Clarify in README during T26 doc sweep.

### B-006 · Info · curated executables · `skills/superpowers/brainstorming/scripts/`, shell helpers

**Decision #6:** Accepted risk. Haus copies to `.claude/skills/`; user/agent may run. Optional runbook note; no removal.

### B-007 · Low · engines mismatch · `package.json` engines `>=18`

CI uses Node 22; align to `>=22` in cleanup phase.

---

## 6. `haus` Workflow Findings

- **WF-1 (= CLA-1):** Missing-hash header bypasses tamper protection — the core managed-block guarantee silently fails for legacy/stripped headers. → T4
- **WF-2 (= CLA-8):** Managed-block sentinel handling fragile to nesting/unbalanced markers. → T15
- **WF-3 (= CLA-2):** Hook re-add overrides user opt-out on every `apply`. → Human decision required (CLA-2)
- **WF-4 (= CLA-7):** Two divergent HAUS-MANAGED header parsers risk format drift. → T14
- **WF-5 (= INT-1):** Ref-policy divergence (runtime tag vs fixture main) can produce spurious contract-drift CI failures. → T7

---

## 7. Combined-System Findings

### INT-1 · Medium · ref-policy-divergence

**Files:** A `src/catalog/remote-catalog.ts:49-67`, A `.github/workflows/sync-catalog-fixture.yml:27`, A `scripts/contract-check.mjs:40`, B `.github/workflows/dispatch-fixture-sync.yml:19`
**Evidence:** Runtime resolves latest **tag**; fixture sync, dispatch, and contract-check all operate on **main**. Between catalog merge and release, these diverge.
**Impact:** Spurious red contract-drift CI; fixture-vs-served mismatch for users.
**Fix (T7):** Pick one ref policy; sync all three consumers. Recommended: tag (matches runtime). Requires maintainer decision.
**Verify:** Non-release commit to catalog `main`; contract-drift stays green.

### INT-3 · Low-Med · `src/catalog/remote-catalog.ts:577-590`

`fetchLatestCatalogTag` returns `tags[0]?.name` — GitHub `/tags` ordering unspecified. Fix (T17): semver-sort, pick max valid `vX.Y.Z`.

### INT-4 / REC-2 · Low · dead-contract

`type: 'rule'` in A `types.ts:64` + B schema, but 0 manifest items and `KNOWN_ITEM_TYPES` in A omits it (sync would fail any `rule` item while recommend still recommends it → split-brain). Fix (T13): remove or wire properly; write ADR. Requires maintainer decision.

### INT-2 · Low · `src/catalog/constants.ts:8`

`wearehaustech` (lowercase) vs everywhere else `WeAreHausTech`. Fix (T16): normalize.

### OPS-1 · Medium · cross-repo token ops · `dispatch-fixture-sync.yml` + `HAUS_WORKFLOW_DISPATCH_TOKEN`

**Evidence:** Catalog holds long-lived PAT → `repository_dispatch` → CLI opens fixture PR. Token exists (decision #5) but long-lived secrets carry rotation/scope risk.
**Fix (T35–T37):** Pull-based sync in `haus-workflow` (cron + `workflow_dispatch`); retire PAT after stable. Interim: fine-grained PAT, minimal scope, tag-trigger only (T32).
**Verify:** Push catalog release tag → CLI fixture PR opens without catalog→CLI write token.

### I-003 · Medium · test fixture coverage · `tests/fixtures/catalog/manifest.json`

50 items vs 79 production. `contract-check` BP#3 key-set only. 29 items untested in recommender fixtures.
**Fix:** Expand fixture in P6 cleanup or per new catalog item.

**Verified clean:** Fixtures byte-identical (manifest + validation-rules, v2.7.2, 79 items), schema/type/path contracts hold, dispatch↔sync handshake wired correctly (event `sync-catalog-fixture`, token `HAUS_WORKFLOW_DISPATCH_TOKEN`, HTTP 204 check), no broken min-version gates.

---

## 8. Documentation Findings

| ID     | Sev    | File:line                                                    | Claim → Reality                                                                   | Task |
| ------ | ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---- |
| DOC-1  | High   | `CLAUDE.md:27`                                               | "71 items" → **79 items**                                                         | T26  |
| DOC-2  | High   | `docs/architecture.md:121`                                   | "v2.5.0 / 71 items" → **v2.7.2 / 79** (or drop hardcoded count)                   | T26  |
| DOC-3  | Medium | `README.md:82`                                               | "Fetched from `main`" → fetched from latest **release tag**, `main` fallback only | T26  |
| DOC-4  | Medium | `docs/security.md:91`                                        | "scoring flow" → **binary eligibility** (ADR-0002 removed scoring.ts)             | T26  |
| DOC-5  | Medium | `docs/architecture.md:23-24`                                 | lists `src/library/` → **does not exist**                                         | T26  |
| DOC-6  | Medium | `docs/cli.md:33,115-121`                                     | `apply` omits `--force`; workspace omits `discover`/`setup`/`doctor`              | T26  |
| DOC-7  | Low    | `README.md:69`                                               | `haus guard` listed bare → requires subcommand                                    | T26  |
| DOC-8  | Medium | `README.md:75`, `docs/architecture.md:128`, `docs/cli.md:99` | `haus.memory-conventions` catalog item → **removed**; use native `MEMORY.md`      | T38  |
| DOC-9  | Low    | `haus-workflow-catalog/CHANGELOG.md`                         | Claims `release.yml` uses `haus validate-catalog` → still `validate.mjs`          | T40  |
| DOC-10 | Low    | `haus-workflow-catalog/docs/deployment.md:5,61`              | "fetch from `main`" → **latest release tag** (decision #1)                        | T26  |
| DOC-11 | Low    | `src/types.ts:60`, `catalog/scripts/validate.mjs:18`         | Dead `EXECUTION-PLAN.md` references                                               | T39  |

**Verified accurate:** all `docs/codebase.md` src paths, all `docs/security.md` token lists, all script references in `docs/dev.md`/`runbook.md`, ADR-0002/0003/0007 behavior claims, all `docs/SUMMARY.md` and ADR README internal links.

---

## 9. Prune Candidates

| Candidate                                           | Evidence                                      | Risk                     | Safe plan                                        | Verify                                      |
| --------------------------------------------------- | --------------------------------------------- | ------------------------ | ------------------------------------------------ | ------------------------------------------- |
| `ignore@6.0.2` (`package.json`)                     | Zero imports in src/scripts/tests             | Very low                 | `yarn remove ignore` (T24)                       | `yarn build && yarn test`                   |
| `// test` comment (`versions.ts:40`)                | Stray committed marker                        | None                     | Delete (T25)                                     | `yarn verify`                               |
| `rule` type (`types.ts`, repo B schema)             | 0 items; omitted from `KNOWN_ITEM_TYPES`      | Medium — public contract | **Decided: remove** (T13) + ADR                  | `grep '"type": "rule"' manifest.json` empty |
| `validate.mjs` vs `validate-catalog.ts` duplication | Two divergent validators                      | High — false pass risk   | **Unify** via `validate-core` (T34)              | Parity test suite                           |
| `schema/haus-lock.schema.json`                      | Nothing validates in repo B                   | Do NOT remove            | Keep — downstream contract; add `$comment` (T29) | n/a                                         |
| Misplaced `ci.yml:81` comment                       | Describes `pack-smoke`, sits above `gitleaks` | None                     | Move comment to L104 (T30)                       | `actionlint`                                |

---

## 10. Missing Functionality / Docs / Tests

**Missing tests (priority order):**

1. TST-1 (High): missing-`hash=` header tamper case — T4
2. TST-2 (Medium): malformed `settings.json` through merge path — T2
3. TST-3 (Medium): guard case/whitespace evasion characterization — T20
4. TST-4 (Medium): `fetchNpmVersionStatus`, `summarizeLockDiff` — T21
5. TST-5 (Low-Med): `readWorkflowTemplate`, `getCacheManifestAge`, `fetchLatestCatalogTag` — T22

**Structural test gate gap (TST-6 / T23):** `test-fast.mjs` `SLOW_INTEGRATION` excludes the highest-stakes tamper/lockfile tests from pre-push. They are fast (temp-dir fs, no network) — move them in.

**Missing docs (T26):** `apply --force`, workspace `discover`/`setup`/`doctor`, catalog fetch ref, scoring→eligibility terminology, remove phantom `src/library/`.

**Missing functionality:** `rule` catalog item type is declared but unimplemented (T13 — **decided: remove**). Validator parity gap (VAL-1) — T34. No other missing functionality found.

---

## 11. Task reference (by ID)

| ID     | Phase | Goal                          | Primary files                                                           | Validation                               |
| ------ | ----- | ----------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| T31    | P0    | Fixture sync from release tag | `haus-workflow/.github/workflows/sync-catalog-fixture.yml`              | Tag URL in curl; PR updates bundled copy |
| T32    | P0    | Catalog dispatch on tag push  | `haus-workflow-catalog/.github/workflows/dispatch-fixture-sync.yml`     | Tag push triggers sync                   |
| T33    | P0    | Contract-check uses tag       | `haus-workflow/scripts/contract-check.mjs`                              | `CONTRACT_STRICT=1` passes post-release  |
| T34    | P1    | Unified validate-core         | `catalog/scripts/validate-core.mjs`, `src/commands/validate-catalog.ts` | Parity tests identical failures          |
| T35    | P3    | Pull-based sync workflow      | `haus-workflow/.github/workflows/sync-catalog-from-release.yml`         | Cron opens PR without catalog PAT        |
| T36    | P3    | Demote dispatch workflow      | `catalog/.github/workflows/dispatch-fixture-sync.yml`                   | Optional backup only                     |
| T37    | P3    | Retire PAT + runbook          | Both `docs/runbook.md`                                                  | Secret removed; sync still works         |
| T38    | P0    | Memory doc cleanup            | `README.md`, `docs/architecture.md`, `docs/cli.md`                      | `rg memory-conventions` → 0              |
| T39    | P6    | Stale comment cleanup         | `src/types.ts`, `catalog/scripts/validate.mjs`                          | No `EXECUTION-PLAN` refs                 |
| T40    | P6    | CHANGELOG accuracy            | `haus-workflow-catalog/CHANGELOG.md`                                    | Matches `release.yml`                    |
| T1–T30 | P4–P6 | See checklist above           | Various                                                                 | `yarn verify`                            |

---

## 12. Verification Matrix

| Area                | Checks performed                                                | Result               | Confidence | Remaining uncertainty                           |
| ------------------- | --------------------------------------------------------------- | -------------------- | ---------- | ----------------------------------------------- |
| Recommender gates   | Read `recommend.ts:75-244` + `manifest-schema.ts` (direct)      | REC-1 confirmed      | High       | Coerce vs reject policy is maintainer choice    |
| Tamper detection    | Read `write-workflow.ts:55-99` (direct)                         | CLA-1 confirmed      | High       | Intent of no-hash legacy headers                |
| Settings merge      | Agent read `settings-merge.ts` (462 LOC) + `fs.ts` (direct)     | CLA-3/4/10 confirmed | High       | Whether WF-3 re-add is intended                 |
| Security guards     | Read `guard-file-access.ts` (direct); `guard-bash.ts` via agent | CMD-2/3 confirmed    | High       | None                                            |
| Catalog content (B) | 79 items, ~15 sampled, `validate.mjs` run locally               | Clean (CAT-1 minor)  | High       | gitleaks not executed; skill prose not reviewed |
| Cross-repo fixtures | `diff` of manifest + validation-rules                           | Byte-identical       | High       | None                                            |
| Dispatch handshake  | Read both workflows                                             | Wired correctly      | Med-High   | Live trigger + secret not executed              |
| Dependencies        | grep every dep across src/scripts/tests                         | `ignore` unused      | High       | None                                            |
| Docs                | Each claim grep-verified vs code                                | 7 findings           | High       | None                                            |
| Test coverage       | Mapped 75 test files → src                                      | Gaps in TST-1..6     | Med        | Coverage % not run (`c8` not executed)          |
| Validator parity    | Compare `validate.mjs` vs `validate-catalog.ts`                 | VAL-1 gap confirmed  | High       | T34 closes                                      |
| Contract-check      | `node scripts/contract-check.mjs`                               | PASS vs live main    | High       | Re-verify after T33 uses tag                    |
| `yarn verify`       | Full CLI suite                                                  | 462/462 pass         | High       | Re-run after each phase                         |

---

## 13. Final Confidence Statement

**Fully verified (read source directly):** REC-1, CLA-1, CLA-10, CMD-2. Fixture parity (byte-diff). Dependency usage (grep). Doc claims (grep vs code). Catalog item count/version (79 / v2.7.2) and zero-orphan status.

**Partially verified (agent-read + spot-checked):** CLA-3/4/5, CMD-1/3/4/6/7/8, all CLA cleanup items, INT-1/2/3/4, all test-coverage findings. Evidence quotes are specific and consistent across independent agents.

**Could not verify:** Live runtime GitHub fetch, `gitleaks` execution, dispatch live trigger + secret, repo B skill prose quality, actual coverage percentages.

**All human decisions recorded (2026-06-16):**

- **Q1 / INT-1 (T7, T31–T33):** **Release tag everywhere** — runtime, fixture sync, contract-check resolve latest catalog release tag; `main` is dev-only
- **Q2:** **Advisory contract on PR** — `contract-check` warns + exit 0 on PR; strict on `main`/cron
- **Q3 (T34):** **Unify validators** — shared `validate-core` module; catalog + CLI thin wrappers
- **Q4 / INT-4 (T13):** **Remove `rule` type** — delete from type union + repo B schema; write ADR
- **Q5 (T35–T37):** **Token exists**; migrate to pull-based fixture sync; retire `HAUS_WORKFLOW_DISPATCH_TOKEN` after stable
- **Q6:** **Curated executables acceptable** — no removal; optional runbook note
- **REC-1 (T1):** **Reject whole manifest** — return `ok:false` on any item missing `tags`/`repoRoles` arrays
- **CLA-2 (WF-3):** **Intended contract** — document haus hooks as always-enforced on apply; no code change (T26)

No remaining blockers. All tasks executable.
