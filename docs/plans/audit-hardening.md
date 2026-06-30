# Plan: Audit Hardening — Supply-Chain, Recommender Gates, CI

> Remediation of the deep audit (2026-06-30) across both repos. macOS-only user base — CRLF findings demoted to defense-in-depth.

## Structure: two PRs

| PR       | Repo                    | Theme                                         |
| -------- | ----------------------- | --------------------------------------------- |
| **PR-B** | `haus-workflow-catalog` | Align validator; harden release CI; doc fixes |
| **PR-A** | `haus-workflow` (CLI)   | Fail closed; fix recommender gates; cleanups  |

### Cross-repo ordering

**No hard dependency between PRs.** B1/A1 (content digest chain) were dropped (see below) — the PRs are independent and can merge in any order.

---

## PR-B — haus-workflow-catalog

### B1 — Align `deprecated` validator [H6]

- **What:** `scripts/validate-core.mjs:207` rejects `curated + deprecated`; CLI accepts it; both schemas list `deprecated`. One-line fix: add `|| item.reviewStatus === 'deprecated'` to the `isCuratedApproved` condition, making the deprecation path reachable end-to-end (catalog can ship a deprecated item; CLI skips recommending it and shows a warning; prune handles it).
- **Acceptance:** A curated item with `reviewStatus: deprecated` passes catalog CI.
- **Verify:** add fixture/unit test for a deprecated curated item through `validate-core.mjs`; `yarn test`.
- **Files:** `scripts/validate-core.mjs:207`.

### B2 — Secret scan + tests on release path [M8]

- **What:** `release.yml` tag-push path runs only `check-manifest-version` + `validate.mjs` — no gitleaks, no `yarn test`. A tag pushed off a non-PR'd commit ships unscanned. Add gitleaks + `yarn test` to `release.yml`, or gate the release job on `validate.yml` success for the tag SHA.
- **Acceptance:** Release job fails if gitleaks finds a secret or tests fail.
- **Verify:** dry-run on a branch (via `act` or throwaway fork tag).
- **Files:** `.github/workflows/release.yml`.

### B3 — Curated sync review checklist [M9, revised]

- **What:** `sync-upstream.mjs:145` intentionally clones upstream HEAD (the `snapshotRef` field records provenance, it's not a pre-approved target). The real gap is that `npxTsxOnlyExempt:["curated"]` removes automated npx detection for curated content, so a reviewer can miss a new `npx` invocation. Add a comment block at the top of `sync-upstream.mjs` (and a `docs/runbook.md` entry) that makes this explicit: curated sync PRs bypass the npx guard — reviewer must manually check the diff for any new `npx` usage.
- **Acceptance:** Comment present in `sync-upstream.mjs`; runbook entry present.
- **Verify:** manual review of comment placement.
- **Files:** `scripts/sync-upstream.mjs` (top-of-file comment), `docs/runbook.md`.

### B4 — Doc fixes [L6]

- **What:** `README.md:9` says "79 items … 6 commands"; actual is 94 items (73 skills, 15 agents, 4 templates, 2 config, 0 commands). `commands/` dir doesn't exist (`excludeCommands: true` in sources). Update count + breakdown, drop "commands" category. Fix `CLAUDE.md` repo-structure block that still lists `commands/superpowers/`.
- **Acceptance:** Counts match `manifest.json`; no reference to a non-existent `commands/` dir.
- **Verify:** cross-check count against `manifest.json` length.
- **Files:** `README.md`, `CLAUDE.md`.

---

## PR-A — haus-workflow (CLI)

### A1 — Fail closed on tag-resolution failure [H2 + M3]

- **What:** `src/catalog/remote-catalog.ts:57` silently returns `'main'` when tag resolution fails for any reason (network blip, 5s timeout, GitHub API rate-limit at 60 req/hr unauthenticated). `main` is a moving target — unreviewed content. On failure, fall back to existing cache/bundled snapshot and emit a loud warning. Surface the resolved ref to the user whenever it is `main`. Require explicit `HAUS_CATALOG_REF=main` to opt in to the moving-target branch.
- **Acceptance:** Any tags-API failure does not silently serve `main`; user sees a warning; run continues from cache/bundled.
- **Verify:** unit test: mock tags-API returning null → resolver does not return `'main'`; falls back. `yarn test`.
- **Files:** `src/catalog/remote-catalog.ts:49-57`.

### A2 — Re-validate on apply (cache → .claude/) [H4]

- **What:** `src/claude/write-claude-files.ts:269` does raw `fs.copy` from cache into `.claude/` with no content check. `validateCatalogItem` runs only at ingest. Run it again per `.md` immediately before copy, treating cache as untrusted (defense-in-depth against anything that bypasses ingest validation: manual cache write, `HAUS_FIXTURE_CATALOG` override, etc.).
- **Acceptance:** An item in cache carrying a forbidden tag or risky install pattern is blocked at apply time.
- **Verify:** unit test: poisoned cache item → apply refuses to copy it. `yarn test`.
- **Files:** `src/claude/write-claude-files.ts`.

### A3 — Token-match recommender gates [H5]

- **What:** `src/recommender/recommend.ts:92,121` use `itemSearchText.includes(x)` — bare substring. `javascript` matches forbidden `java`; `mongodb`/`go-router` match `go`; `exports` is plain English. Current 94-item catalog has zero collisions but the next tag addition silently drops. Match whole tokens: check `item.tags.includes(x)` for FORBIDDEN_TAGS (these are tag values, not free text); anchor short ambiguous tokens (`go`, `java`, `dart`) to exact-tag equality.
- **Acceptance:** An item tagged `javascript` or `mongodb` is NOT dropped by the `java`/`go` gate.
- **Verify:** regression test with colliding tags → item recommended, not skipped. `yarn test`.
- **Files:** `src/recommender/recommend.ts:92,121`.

### A4 — Source-trust from live reviewStatus [M6]

- **What:** `src/recommender/recommend.ts:43,125` reads trust from on-disk `sources-report.json`. If the report is stale (generated before a `reviewStatus` downgrade), a rejected item leaks through. Derive trust from live `item.reviewStatus`/`item.riskLevel` in-memory instead — call `buildSourcesReport(items)` rather than reading the file.
- **Acceptance:** An item with live `reviewStatus: rejected` is skipped even when the on-disk report says approved.
- **Verify:** test: live-rejected item + stale-approved report → item skipped. `yarn test`.
- **Files:** `src/recommender/recommend.ts`.

### A5 — Rename sources-report `id` → `source` [M7]

- **What:** `src/scanner/write-sources-report.ts:18` emits a field named `id` that holds a _source name_ (e.g. `"curated"`). `recommend.ts:77` builds a Map keyed by it and queries via `sourceTrust.get(item.source)` — internally consistent but a naming landmine: any editor who "fixes" it to `.get(item.id)` silently breaks the gate. Rename field to `source` + add asserting test.
- **Acceptance:** Field named `source`; producer and consumer aligned; test asserts key is the source name.
- **Verify:** `yarn test`.
- **Files:** `src/scanner/write-sources-report.ts`, `src/recommender/recommend.ts`, type defs.

### A6 — Gate `HAUS_CATALOG_REMOTE_BASE` to test-only [M1]

- **What:** `src/catalog/remote-catalog.ts:60` honors any env value as fetch base in shipped code — a poisoned shell env (CI, `.env`, direnv) redirects the entire supply chain to an attacker. Gate behind `NODE_ENV==='test'` or a dedicated `HAUS_TEST_MODE` flag, or restrict to `localhost` only.
- **Acceptance:** Production build ignores an arbitrary remote base.
- **Verify:** test: env set without test mode → ignored. `yarn test`.
- **Files:** `src/catalog/remote-catalog.ts:60-63`.

### A7 — Validate `.md` in config directories [M2]

- **What:** `src/catalog/remote-catalog.ts:476` syncs config dirs with `validateMarkdown:false`; `.md` files inside skip the forbidden-tag / risky-install scan. Run `validateCatalogItem` on every `.md` regardless of item type.
- **Acceptance:** A `.md` under a config dir prefix with a forbidden tag is rejected at ingest.
- **Verify:** test with a config-dir fixture containing a forbidden tag. `yarn test`.
- **Files:** `src/catalog/remote-catalog.ts:476-493`.

### A8 — Legacy/malformed hash → rewrite, not skip [M5]

- **What:** `src/claude/managed-template.ts:25` drops an unrecognised hash format → `src/claude/write-workflow.ts:75` treats it as unverifiable and skips (`--force` required). A file written by an older haus with a different hash format is silently stuck. Treat a parseable-but-hashless header as due-for-rewrite: gate _ownership_ on `id`/`v`; use hash presence only to decide body overwrite-vs-preserve; rewrite the header unconditionally when the body matches the current template.
- **Acceptance:** A file with a legacy hash format is migrated on next `haus apply`, not silently skipped.
- **Verify:** test: header with legacy hash → update applies. `yarn test`.
- **Files:** `src/claude/managed-template.ts:25`, `src/claude/write-workflow.ts:75`.

### A9 — Cleanups [L1, L2, L3, L5, L6, C1]

- **L1** drop CLI prerelease semver regex branch `src/catalog/validate-core.ts:22` (match schema + catalog which both reject prereleases).
- **L2** log HTTP status / error class at `warn` in fetch error handlers `src/catalog/remote-catalog.ts:76` (cert error and offline are currently indistinguishable; a TLS failure is a MITM signal).
- **L3** match `config-signal-match` against a structured signal, not free-text warning prose `src/recommender/recommend.ts:201` (future warning strings could spuriously match short tags).
- **L5** move `co-install-react-reviewer` suppression into `applyCoInstallSuppression` (post-eligibility) `src/recommender/recommend.ts:156` — currently runs pre-eligibility, producing a misleading skip reason.
- **L6** fix item count in `CLAUDE.md:27` (94, not 71; add `config` type; drop "commands").
- **C1** (defense-in-depth) add `normaliseLF` to `hashContent` `src/install/apply.ts:65` + round-trip test. macOS LF so not urgent, but cheap and closes the gap if an editor injects CRLF.
- **Acceptance:** each is a self-contained tested change.
- **Verify:** `yarn verify` (typecheck + lint + build + test).

### A10 — `contract-check.mjs` in CLI release [M10]

- **What:** `release.yml:47` runs `yarn verify` but not the cross-repo drift check. A tag pushed during a drift window publishes stale bundled fixtures. Add `node scripts/contract-check.mjs` with `CONTRACT_STRICT=1`.
- **Acceptance:** Release fails if bundled `library/catalog/*.json` drifts from canonical.
- **Verify:** dry-run on a branch with intentionally-stale fixture → fails.
- **Files:** `.github/workflows/release.yml`.

---

## Per-repo merge checklist (from CLAUDE.md)

- [ ] `yarn verify` (typecheck + lint + build + test)
- [ ] New code ships with tests; `fix:` commits include a regression test
- [ ] **writing-documentation** skill run if setup/commands/env/integration changed (B4, L6 touch docs)
- [ ] Squash-merge: `gh pr merge <n> --squash --delete-branch`

## Dropped / out of scope

- **B1/A1 (content digest chain):** Dropped. Adding `contentHash` to a fetched manifest is security theater — an attacker who can tamper content can also tamper the manifest hashes. Real integrity requires hashes in the CLI binary (breaks release independence) or cryptographic signing (out of scope). Current model (HTTPS from `raw.githubusercontent.com` + schema validation + forbidden-content scan) is the same trust model as npm and is appropriate here.
- **L4** sync-lag paging: `contract-drift.yml` already reddens CI mid-week. Adding paging is an ops decision, not a code fix — defer.
- Symlink/mode handling on tree listing: low risk, content written via `fs.writeFile` not symlink extraction.
