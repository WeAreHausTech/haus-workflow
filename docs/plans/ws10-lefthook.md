# WS10 — Dogfood Lefthook (CLI switch + minimal catalog hook)

> Source: `docs/plans/system-audit-remediation.md` Part B WS10. **Two PRs** — one per repo. Land the CLI switch first, then the catalog hook (consistent adoption).
> Deps: WS5 (`package.json` `prepare`/`postinstall` — merged), WS1 (`haus.lefthook-security` gitleaks+grep stage — present at `haus-workflow-catalog/templates/lefthook-security.yml`).

## Why

The shipped standard (`.claude/WORKFLOW.md`) mandates **Lefthook** ("Go binary, faster than Husky", `fail_text` for agent-readable hook output) and WS1 ships a `haus.lefthook-security` template to users — yet `haus-workflow` itself uses **Husky** and the catalog has no local hooks. Practice contradicts the pitch. WS10 makes both repos run the standard they ship.

---

## PR 1 — CLI (`haus-workflow`): Husky → Lefthook

### Current state

- `prepare: husky || true` (WS5), `.husky/pre-commit` = `yarn lint-staged`, `.husky/pre-push` = `yarn typecheck && yarn test`.
- devDeps `husky`, `lint-staged`; a `lint-staged` block (`**/*.ts` → eslint, prettier --write).
- scripts: `lint` = `eslint src scripts`, `format` = `prettier --write .`, `typecheck` = `tsc --noEmit`, `test` = node test runner.

### Changes (T1.1–T1.4)

**T1.1 — `lefthook.yml`** at repo root, every command with an agent-readable `fail_text`:

- `pre-commit` (`parallel: true`):
  - `lint` — `glob: '*.{ts,mjs}'`, `run: yarn eslint {staged_files}`.
  - `format` — `glob: '*.{ts,mjs,json,md,yml}'`, `run: yarn prettier --write {staged_files}`, `stage_fixed: true`.
  - `typecheck` — `run: yarn typecheck` (whole-project; tsc can't do single-file). Per the shipped standard, typecheck is a pre-commit gate.
  - `gitleaks` + `secret-grep` — the exact two stages from `haus.lefthook-security` (gitleaks only if installed; grep baseline scans ADDED lines for inline credentials). Dogfoods the template haus ships.
- `pre-push`: `test` — `run: yarn test` (slow gate off pre-commit).

**T1.2 — remove Husky.** Delete `.husky/`; drop `husky` + `lint-staged` devDeps and the `lint-staged` block.

**T1.3 — `prepare`.** `prepare: lefthook install || true` (the `|| true` keeps git-install consumers safe — same crash-guard intent as WS5).

**T1.4 — `lefthook` devDep** added; `.claude/workflow-config.md` pre-commit tool → Lefthook (removes the dogfooding contradiction noted in `workflow-config.md`'s "Pre-commit tool" line).

### Acceptance

A staged lint error blocks commit with its `fail_text`; a staged inline secret blocks commit; `git push` runs the test suite; `yarn verify` green; `.husky/` gone, no `husky`/`lint-staged` in `package.json`.

### Verify

`yarn verify`; manual: `lefthook install` then stage a file with an eslint error → commit blocked with `fail_text`; stage a line holding an inline credential assignment → secret-grep blocks; `git push` runs tests. A test asserting `package.json` has no `husky`/`lint-staged` and `prepare` uses `lefthook`.

> Note: secret-grep is the exact stage shipped in `haus.lefthook-security`, so it carries that stage's known coarseness — an inline `keyword: value` / `keyword = value` in prose or a variable name can false-positive. Kept verbatim for dogfooding parity; a future refinement should land in the catalog template and propagate here.

---

## PR 2 — Catalog (`haus-workflow-catalog`): minimal Lefthook hook

### Current state

- `private: true`; no `prepare`, no `.husky/`, no local hooks. CI (`validate.yml`) gates `yarn validate` + version checks on push/PR.
- scripts: `validate` = `node scripts/validate.mjs`, `format:check`, `format`, `lint` = `eslint scripts/`.

### Changes (T2.1–T2.3)

**T2.1 — `lefthook.yml`** (`pre-commit`, `parallel: true`), each with `fail_text`:

- `validate` — `run: yarn validate` (catch a broken manifest before the CI round-trip).
- `format` — `glob: '*.{json,md,mjs,yml,yaml}'`, `run: yarn prettier --write {staged_files}`, `stage_fixed: true`.
- (optional) `lint` — `glob: 'scripts/*.mjs'`, `run: yarn eslint {staged_files}`.

**T2.2 — `prepare: lefthook install`** (safe — `private: true`, contributors only; no `|| true` needed but harmless to add).

**T2.3 — `lefthook` devDep** added. CI unchanged (the hook is fast local feedback, not a CI replacement).

### Acceptance

Committing a manifest that fails `yarn validate` is blocked locally with its `fail_text`; format issues caught pre-commit; `yarn validate` still green; push → CI still passes.

### Verify

`lefthook install`; stage an invalid manifest edit → commit blocked; `yarn validate` green on a clean tree; push → CI green.

---

## Sequencing & risk

- **Order:** PR 1 (CLI) first, then PR 2 (catalog) — both repos adopt Lefthook consistently; the catalog PR is small.
- **No-stacking:** merge PR 1 before opening PR 2.
- **Risk:** low. Hooks are dev-time only; CI remains the correctness floor in both repos. The `|| true` on the CLI `prepare` preserves the WS5 git-install guarantee.

## Out of scope

No behavior change to the CLI or catalog content. No new catalog items (the `haus.lefthook-security` template already exists from WS1; WS10 only _consumes_ its stages in the CLI's own `lefthook.yml`).
