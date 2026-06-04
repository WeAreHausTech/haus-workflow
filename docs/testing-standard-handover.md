# Testing Standard — Handover

> Hardened test + bug-prevention setup for **haus-workflow** (CLI, "Repo A") and
> **haus-workflow-catalog** (content catalog, "Repo B"). Delivered across 5 merged PRs.
> Goal: future features/changes cannot ship a regression green.

---

## TL;DR — what's enforced now

1. **Critical logic is unit-tested.** The modules the project flags as highest-stakes (recommender eligibility, template tamper detection, lockfile, hashing, redaction) now have direct tests.
2. **Coverage can't silently drop.** c8 measures it; a ratchet gate fails CI if coverage falls below the floor.
3. **Every `fix:` commit must ship a test.** CI's `fix-needs-test` job blocks a `fix:` PR that doesn't touch `tests/`.
4. **Cross-repo drift is caught.** A contract check compares the CLI's committed copies against the live catalog; warns on PR, fails on `main`/cron.
5. **The catalog repo has tests at all** (it had zero). 37 tests over validation, schema, references, forbidden content.
6. **Branch protection** on both repos: PR required, linear history, no force-push/delete, required status checks.

---

## The 5 phases (all merged)

| Phase                | PR  | What landed                                                                                    |
| -------------------- | --- | ---------------------------------------------------------------------------------------------- |
| 1 — Test backfill    | #64 | 98 unit/regression tests for previously untested critical logic                                |
| 2 — Coverage tooling | #66 | c8 + `.c8rc.json` + `scripts/coverage-ratchet.mjs` + CI steps                                  |
| 3 — Bug fixes (TDD)  | #65 | Fixed catalog-audit list drift + scanner EMFILE risk, each red→green                           |
| 4 — Catalog tests    | #10 | Repo B's first test layer (4 buckets) + pre-push hook                                          |
| 5 — Contract + gates | #67 | `scripts/contract-check.mjs`, `contract-drift.yml`, gate flip, `fix-needs-test`, ADR + runbook |

---

## How to run things

### Repo A (haus-workflow)

```bash
yarn test            # fast loop: node --import tsx --test tests/**/*.test.js
yarn build           # tsup → dist/ (REQUIRED before coverage; suite needs dist/)
yarn test:coverage   # c8 instrumented run → coverage/coverage-summary.json
yarn coverage:check  # c8 with --check-coverage (enforces floor)
node scripts/coverage-ratchet.mjs   # global regression gate + hot-path hints
node scripts/contract-check.mjs     # live cross-repo drift check
yarn verify          # typecheck + lint + build + test + prepack
yarn verify:full     # yarn verify && yarn coverage:check
```

### Repo B (haus-workflow-catalog)

```bash
yarn test            # node --test "tests/**/*.test.mjs"  (.mjs, no tsx)
yarn validate        # node scripts/validate.mjs (the production validator)
```

---

## Test layout

### Repo A — `tests/*.test.js` (Node built-in runner via tsx)

Critical-logic tests added in Phase 1:

- `recommender-policies.test.js`, `recommend-eligibility.test.js` — eligibility gates, wildcard pkg patterns, warning dedup, schema-drift coercion
- `managed-template.test.js` — LF normalization + HAUS-MANAGED header parse (tamper hash)
- `write-workflow.test.js` — hash tamper detection, dry-run cache safety, 404 handling (mock HTTP server)
- `lockfile.test.js`, `hash-installed.test.js` — drift detection + hashing primitive
- `redact-sensitive.test.js` — secret masking + near-miss
- `load-catalog.test.js` — catalog source precedence
- CLI regression guards: `install-postinstall-notice.test.js`, additions to `doctor.test.js` + `guard.test.js`
- Phase 5: `contract-invariants.test.js` — offline fixture/schema invariants

Fixtures: `tests/fixtures/catalog/policy-gates-manifest.json` (one item per policy gate).

### Repo B — `tests/*.test.mjs`

- `validate.test.mjs` — drives the real `scripts/validate.mjs` over temp manifests, one test per fail() branch + happy path
- `schema.test.mjs` — real manifest/items vs JSON schemas (ajv)
- `references.test.mjs` — every path + relative reference resolves on disk; fails fast on insecure `http://`
- `forbidden-content.test.mjs` — placeholders/risky-install/npx/http/forbidden-tags scan, driven by `validation-rules.json`
- `tests/helpers/catalog-fixture.mjs` — builds throwaway catalog roots, runs the validator as a child process

---

## The gates (how they fail)

### Coverage ratchet — `scripts/coverage-ratchet.mjs`

- Reads `coverage/coverage-summary.json`, compares to floor in `.c8rc.json`.
- **FAILS** only if a global metric drops **below** floor (real regression).
- **Hints** (non-fatal) when coverage exceeds floor by ≥1pp ("raise floor to N") and for hot-path files below the per-file line target (85%).
- Floor never auto-edits — it only ratchets up by hand. Current baseline ~58% lines, floor 54.
- CI steps in `ci.yml` are **blocking** (Phase 5 removed `continue-on-error`).

### fix-needs-test — `ci.yml` PR job

- Any commit in the PR range whose subject starts with `fix:` / `fix(` requires the PR diff to touch `tests/`.
- Escape hatch: put `[skip-regression-test]` in the PR body (logged as a notice).

### Contract check — `scripts/contract-check.mjs` + `contract-drift.yml`

Runs on PR, push-to-main, and daily cron. Three checkpoints:

- **BP#1** — live catalog `validation-rules.json` vs the CLI's committed copy.
- **BP#3** — committed test fixture vs live schema, on a **key-set** basis (fixture is intentionally a curated subset; fails only if it uses a removed field or omits a newly-required one). `version` exempt; deliberate omissions go in `requiredOmitExempt`.
- **BP#5** — `haus.lock.json` `catalogRef` shape vs live `haus-lock.schema.json`.
- Strictness: **PR = warn (exit 0), main/cron = fail (exit 1)**. Offline = tolerated unless `CONTRACT_STRICT=1`.
- Network vs local errors are distinguished (a `NetworkError` class) — a bad-JSON/fs/programmer error always fails, never masked as "couldn't reach catalog".

### Branch protection (both repos)

- PR required (0 approvals — self-merge OK), `strict` (up-to-date), linear history, no force-push, no deletion.
- Repo A required checks: `build`, `contract-check`, `fix-needs-test`.
- Repo B required check: `validate`.
- `enforce_admins: false` — admins can push directly in an emergency. Flip to `true` to block direct pushes for everyone.

---

## The "no fix without a test" rule (the cultural core)

> **Every `fix:` commit MUST include the regression test that fails before the fix and passes after.**

Enforced three ways: TDD discipline (write the failing test first), the `fix-needs-test` CI gate, and code review. Phase 3 demonstrated it — both bug fixes were proven red (fix stashed → test fails) then green.

---

## Two bugs fixed in-flight (examples of what the standard catches)

1. **catalog-audit list drift** — `src/commands/catalog-audit.ts` kept a private forbidden-tag list parallel to `FORBIDDEN_TAGS` in `validation-rules.ts`. Two lists, one intent → drift. Now imports the canonical list. _Also_ (caught in review) it used substring matching, so `"go"` matched `"mongodb"`/`"django"` — now exact-match per tag + tokenised id check.
2. **scanner EMFILE** — `src/scanner/scan-project.ts` read files via unbounded `Promise.all` (fd exhaustion under low ulimit). Now bounded via a shared `mapWithConcurrency` helper (limit 24), with concurrency coerced to a finite integer.

---

## Where the docs live (per the workflow standard)

- **ADR** `docs/adr/0005-cross-repo-contract-testing.md` — _why_ the live-vs-committed gate + fixture decoupling exist.
- **Runbook** `docs/runbook.md` — _how to fix_: validation-rules drift → merge the sync PR; ratchet says raise floor → bump `.c8rc.json`; fixture drift → edit the curated fixture.
- **Rule of thumb:** ADR = WHY, runbook = HOW TO FIX, CLAUDE.md = stable RULES, `workflow-config.md` = project VALUES (test commands, highest-stakes modules).

---

## Adding tests going forward (cheat sheet)

- **New pure/domain function** → TDD: failing test first in `tests/<module>.test.js`, cover happy path + edge cases + invariants.
- **Network-dependent code** → mock HTTP server pattern (see `write-workflow.test.js` / `remote-catalog.test.js`); set `HAUS_CATALOG_REMOTE_BASE` + `HAUS_CATALOG_CACHE_DIR_OVERRIDE`.
- **Catalog-dependent code** → drive with `HAUS_FIXTURE_CATALOG` pointing at a fixture manifest; for cache precedence, stub `HOME`/`USERPROFILE` and cache-bust the dynamic import.
- **A bug fix** → write the regression test that goes red first, then fix. The CI gate will reject the PR otherwise.
- **Catalog content** → it's validated by `scripts/validate.mjs`; new items need the required sections, no banned phrases, no forbidden tags, `https://` only, version `1.0.0`.

---

## Cross-repo sync model (important context)

`validation-rules.json` is canonical in **Repo B**. The CLI consumes a **synced copy** (ADR-0001). A push to Repo B `main` dispatches the fixture sync to Repo A. The contract check is the safety net for when that sync hasn't landed yet — it's why drift "warns on PR, fails on main/cron": a PR may legitimately predate the sync, but `main` must always be consistent.
