# haus-workflow — System Audit & Remediation Plan

## Context

Full audit of the haus-workflow system requested: two repos (`haus-workflow` CLI + `haus-workflow-catalog`), covering repo separation, gaps, completeness, build-vs-buy, automation, UX for non-developers, and code quality. Goal: a prioritized remediation plan that makes the system complete, automatic, and easy for non-developers to drive from Claude Code desktop — without adding new pattern skills/agents.

**Directional decisions made (locked):**

| Decision                               | Choice                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Memory & security: build vs buy        | **Hybrid** — keep proprietary value, delegate the thin/replaceable parts                                          |
| New catalog items                      | **Config templates + docs OK** (e.g. Lefthook config, conventions doc). No new pattern skills/review agents.      |
| Auto-run install on global npm install | **Full auto** — postinstall also merges hooks. Must be non-fatal/idempotent/global-only and print a clear notice. |
| Scan detection completeness            | **Hybrid registry** — data-driven rules, dependency signals derived from manifest, file/content rules stay in CLI |
| Pre-commit tooling                     | **Switch CLI Husky → Lefthook + add a minimal Lefthook hook to the catalog** — dogfood the standard haus ships    |

The single highest-value finding: **the CLI's headline security principle — "enforce critical rules in BOTH CLAUDE.md and `settings.json` deny" (WORKFLOW.md) — is unimplemented.** `src/install/settings-merge.ts` writes only `hooks`; it never writes `permissions.deny`. Closing that is WS1.

---

## Progress

> **For other sessions:** update this section as PRs land. Status: ✅ merged · 🚧 in progress · ⬜ not started. The full PR sequence + dependencies live in **Part C**; the per-workstream spec in **Part B**.

| Order | Workstream                                                                                                                     | Status    | PR           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------ |
| 0     | **WS0** — Test-harness fix (run unit tests via `tsx` against `src/`). _Inserted prerequisite — not in the original numbering._ | ✅ merged | #46          |
| 1     | **WS1** — Security: `permissions.deny` + `SENSITIVE` 3→1 + guard backstop + catalog `haus.lefthook-security`                   | ✅ merged | #47 / cat #2 |
| 2     | **WS8** — `validation-rules` → shared JSON + synced fixture                                                                    | ✅ merged | #49 / cat #3 |
| 3     | **WS3** — detection registry + `detectionStatus` + unsupported signal                                                          | ✅ merged | #50          |
| 4     | **WS4** — `workflow-config.md` auto-fill                                                                                       | ✅ merged | #51          |
| 5     | **WS2** — delete memory store + token-budget router                                                                            | ✅ merged | #52 / cat #6 |
| 6     | **WS6** — non-dev desktop UX                                                                                                   | ✅ merged | #54          |
| 7     | **WS5** — full-auto postinstall + `prepare` fix                                                                                | ✅ merged | #55          |
| 8     | **WS10** — CLI Husky→Lefthook (+ minimal catalog hook)                                                                         | ✅ merged | #56 / cat #7 |
| 9     | **WS7** — code-quality cleanup (file splits, renames, dead code)                                                               | ✅ merged | #57          |
| —     | **WS9** — detectability hardening (folded into WS1/WS3/WS6/WS7)                                                                | ✅ folded | (in hosts)   |

### WS0 — done (PR #46, merged)

- `package.json` `test` → `node --import tsx --test …` so unit tests import real TS from `src/`. The build bundles a single `dist/cli.js` with **no submodules**, so unit suites importing `../dist/<sub>.js` silently no-op'd (false green).
- `tests/install.test.js`: imports `dist`→`src`, removed skip-guards; rewrote the install smoke into a real `applyInstall({ dryRun: true })` test with stubbed `HOME` (hermetic, writes nothing).
- **Why it mattered:** without it, every internals unit test (incl. WS1's) passes vacuously. Verified via mutation (0→1 fail).

### WS1 — done (CLI #47 + catalog #2, merged)

- `src/security/deny-rules.ts` — `buildDenyRules()` derives `permissions.deny` from the SAME lists the guards use: `DANGEROUS_COMMANDS` → `Bash(<cmd>:*)`; `SENSITIVE_PATHS` → `Read/Edit/Write(<glob>)`, dirs → `<dir>/**`.
- `settings-merge.ts` `mergeDenyRules`/`stripHausDeny` (+ `_haus.denyRules`, order-independent) → wired into `applyInstall` (global) and `runUninstall`.
- Project `apply` writes deny via the canonical `loadClaudeHooksSettings()` so the writer + both contract verifiers stay consistent.
- `SENSITIVE` 3→1: `security/sensitive-paths.ts` exports `SENSITIVE_PATHS` (guard), `SENSITIVE_PATH_REGEXES` (scanner), `SENSITIVE_ITEM_KEYWORDS` (recommender). Behaviour-preserving.
- `guard.test.js` rewritten to real invocation; `secret-patterns`/`redact-sensitive` kept (hook-time redaction).
- Catalog: `haus.lefthook-security` template (gitleaks-optional + added-lines-only grep) + deny-syntax doc fix in `agentic-workflow-standard.md` / `.claude/WORKFLOW.md`.
- **New WS8 input discovered:** CI's `haus validate-catalog` enforces a **tag allowlist** (`readAllowedStacks` + specials) that the catalog's local `validate.mjs` does NOT — local-green ≠ CI-green. WS8's "single source" must cover the tag check too, not just the shared constants.

### WS8 — done (CLI #49 + catalog #3, merged)

- **Canonical `validation-rules.json`** at the catalog repo root owns all rule data (forbidden tags, banned phrases, required sections, install-pattern regexes as `{source,flags}`, **and** the stack allowlist). CLI gets it as a synced fixture `library/catalog/validation-rules.json` — same mechanism as `manifest.json`. Recorded as **ADR-0001** (`docs/adr/`); reverses the prior "allowlist lives in the CLI" choice.
- Both `scripts/validation-rules.mjs` (catalog) and `src/catalog/validation-rules.ts` (CLI) are now **thin loaders** — no rule values in code. CLI inlines the JSON at build time (validation is release-coupled, unlike runtime-fetched content).
- **Tag-allowlist drift killed:** one shared `isTagAllowed`/`auditDisallowedTags` evaluator (mirrored both languages). Catalog `validate.mjs` now enforces the allowlist too, so a tag passing local can't fail CLI CI (the WS1 incident). Collapsed _three_ divergent allowlist checks → one.
- Deleted dead `src/catalog/validate-catalog.ts` + `allowed-stacks.ts` + `allowed-stacks.json`.
- Drift backstops: `validate.mjs` asserts `.claude/WORKFLOW.md` byte-identical to `templates/agentic-workflow-standard.md`; `sync-catalog-fixture` + `dispatch-fixture-sync` now cover `validation-rules.json`.
- Behavior note: pattern-suffix match tightened `includes('-patterns')` → `endsWith(suffix)` — identical for the current catalog (all `-patterns` tags suffix-final), matches `PATTERN_TAG_SUFFIXES` intent.

### WS3 — done (CLI #50, merged)

- **`src/scanner/detection-registry.ts`** — typed `DetectionRule[]` + `runDetection()` evaluator replaces the `detectRoles`/`detectStacks` if-chains. Signals: dependency, depPrefix, depAbsent, file (endsWith/includes/equals/startsWith), content; grouped `all` (AND) / `any` (OR). Bucket is type-checked (`StackBucket`). Rules ordered to preserve `detectedStacks` insertion order.
- **Content index built once** (`buildContentBlob`, chunked reads) — old `hasNeedle` re-read ≤300 files per needle (5×).
- **`detectionStatus` (`supported|partial|unknown`) + `unsupportedSignals`** on `ContextMap` — from scanner signals + presence-only marker files (requirements.txt, go.mod, Cargo.toml, pom.xml, build.gradle, Gemfile). Recommender renders a clear unknown/partial message but keeps stack-agnostic baseline.
- **`src/scanner/derive-from-manifest.ts`** — anti-drift: coverage test asserts every bundled-manifest item is recognisable (dependency clause / known role / registry-producible stack). New undetectable item → test fails.
- Behavior locked by a **golden characterization test** (`detection-golden.json`, 11 fixtures, byte-identical). New `python-only` fixture → `unknown` / `['python']`.
- **WS3-discovered follow-ups (not yet done):** recommender's `UNSUPPORTED` list duplicates catalog `FORBIDDEN_TAGS` (fold into shared validation-rules JSON); catalog `{stack:typescript}` vs scanner `typescript5` naming (items match via dependency clause, no current gap).

### WS4 — done (CLI #51, merged)

- **`src/claude/derive-workflow-config.ts`** — script-first inference: real `package.json` script wins (typecheck, lint, lint:fix, format:check, test:e2e); else reconstruct from a present dep/config (tsc/eslint/prettier/playwright/cypress), per-pm format (`npx --no-install` / `yarn` / `pnpm exec`); never guesses an absent tool. Detects validation library, pre-commit tool, doc paths. Un-inferable → honest placeholder.
- **`haus apply --refill-config`** — fills still-blank `<!-- fill in` lines of an existing config; never touches user-edited lines. Threaded cli → apply → write-claude-files → writeWorkflowConfig. `doctor` warns with unfilled-field count.
- Write-once preserved; derive skipped on the common exists-no-refill path (no extra I/O).

### WS2 — done (CLI #52, catalog #6, merged)

- **Memory store deleted** — removed `src/memory/memory-store.ts`, `redact-memory.ts`, `src/commands/memory.ts`, `tests/memory.test.js`; dropped the `haus memory` CLI surface, the `memory inject` UserPromptSubmit hook (CANONICAL_HOOKS + STABLE_HOOK_IDS + bundled `library/global/settings-fragments/hooks.json`), the `memoryInject` gate (`load-hooks-config`, `doctor`), and the `hook.memory` config alias. Native Claude Code `MEMORY.md` supersedes. Kept `src/security/redact-sensitive.ts` (hook-time redactor — different concern).
- **Token budget made real** — `tokenEstimate?` added to recommended items (`types.ts`), echoed from catalog in `recommend.ts`, preserved through `normalizeRecommendation()`. `applyTokenBudget()` in `task-intent.ts` drops lowest-scoring non-baseline rules until cumulative estimate ≤ `DEFAULT_CONTEXT_TOKEN_BUDGET` (12000); baselines never dropped, input order preserved. `haus context` passes the budget.
- **Catalog**: `haus.memory-conventions` template (native-memory practice + `anthropic-skills:consolidate-memory` for periodic merge); manifest 2.2.0→2.3.0.
- **Two real Copilot bugs caught + fixed pre-merge:** (1) `normalizeRecommendation` dropped `tokenEstimate` → budget silently never trimmed on the real `haus context` path; (2) bundled install fragment still carried the removed `memory inject` hook. Both fixed with regression tests (135 tests total).

### WS6 — done (CLI #54, merged)

- **Global slash commands** — `install` seeds `library/global/commands/{haus-setup,haus-doctor,haus-fix}.md` flat into `~/.claude/commands/*.md` (new `command.*` stableId; `collectSourceFiles` reuses the skill copy/stamp/manifest/orphan-cleanup machinery). Discoverable in the `/` menu of every project before first setup. Command bodies are frontmatter-free so the line-1 HAUS-MANAGED stamp stays harmless.
- **Scoped `permissions.allow`** — `mergeAllowRules`/`stripHausAllow` + `_haus.allowRules` mirror the WS1 deny machinery; pre-allows the six `Bash(haus <sub>:*)` subcommands (setup-project/apply/doctor/scan/context/recommend), never a blanket `Bash(haus:*)`. Stripped on uninstall (chain: `stripHausHooks(stripHausAllow(stripHausDeny()))`). All three `_haus` trackers preserved order-independently across merges.
- **NL trigger** — "Driving haus" block in `.claude/rules/haus.md` (kept compact; threshold 600). No edit to the user's global `~/.claude/CLAUDE.md` (locked decision); slash commands are the reliable discovery path.
- **Conversational setup** — `setup-project` skips the readline prompt for any question already answered in `.haus-workflow/setup-answers.json`, so the agent supplies answers from chat. TTY path unchanged.
- **Plain language** — `src/scanner/role-labels.ts` (`friendlyRole` + `describeRepo`, honest on `unknown`/`partial`) feeds `renderSummary`; `doctor` prints a single ✅/⚠️ verdict line FIRST, each issue → sentence + fix command; guard deny messages rewritten plainly (no backticks — JSON reason is rendered as Markdown) while still naming the blocked command/path; `guard.ts` now emits the guard-returned message (DRY); de-jargoned `project.md` / `workflow-config.md` headers.
- **WS9 fold** — `doctor` validates each `@.haus-workflow/*` import target resolves (the sole context bridge) and flags a malformed/unclosed block; `BLOCK_END` searched after `BLOCK_BEGIN`.
- **Five Copilot findings fixed pre-merge:** verdict-not-first, OK-logged-before-validating import block, HOOKS-fail bypassing `flag()`, and backticks around untrusted command/path in the two guard reasons. `yarn verify` green (160 tests).

### WS5 — done (CLI #55, merged)

- **`scripts/postinstall.mjs`** (plain Node ESM, shipped via `package.json#files`) — exported pure gate `shouldRunPostinstall({env,distExists,srcExists})` → `{run,reason}`, then spawns `node <pkgRoot>/dist/cli.js install --postinstall`. Runs ONLY when global + `!CI` + `HAUS_NO_POSTINSTALL!=='1'` + dist present + **src absent** (own-repo dev-checkout guard; published `files` omit `src/`). Double non-fatal: shell `|| true` + try/catch that always `exit(0)`. Direct-invocation guarded so `import` in tests never runs `main()`.
- **`install --postinstall`** — plain-language notice (added/updated counts shown separately, "already up to date" on a repeat run, settings phrased "ensured present"), `haus uninstall` undo, `HAUS_NO_POSTINSTALL=1` disable; detailed file list suppressed in this mode to keep npm output clean.
- **`package.json`** — `postinstall` script, `prepare: husky` → `husky || true` (fixes the latent git-install crash regardless of the WS10 tool swap), script added to `files`.
- **Copilot fixes pre-merge:** notice no longer lumps updates as "added"; settings reads "ensured present" (idempotent-safe). `yarn verify` green (170 tests). Manual: `npm pack` ships the script; dev-checkout run no-ops (exit 0).

### WS10 — done (CLI #56, catalog #7, merged)

- **CLI Husky→Lefthook** — `lefthook.yml`: pre-commit (parallel) = lint (`eslint {staged_files}`) + format (`prettier --write` + `stage_fixed`) + typecheck + gitleaks + secret-grep; pre-push = test; every command has an agent-readable `fail_text`. The gitleaks + secret-grep stages are the exact ones from the `haus.lefthook-security` template — the CLI runs the config it ships. Removed `.husky/`, dropped `husky` + `lint-staged` devDeps + the `lint-staged` block; added `lefthook` devDep; `prepare: lefthook install || true`. `enableScripts:false` repo-wide → `dependenciesMeta.lefthook.built` opts in the binary build. `.claude/workflow-config.md` pre-commit tool → Lefthook (+6 migration-assertion tests, 176 total).
- **Catalog minimal hook** — `lefthook.yml`: pre-commit = `yarn validate` + format (staged, `stage_fixed`) + lint (`scripts/*.mjs`), each `fail_text`; `prepare: lefthook install`; `lefthook` devDep + `dependenciesMeta` build opt-in. CI (`validate.yml`) unchanged — correctness floor; hook is fast local feedback.
- **Two repo-`private` distinction:** CLI is published to npm so its `prepare` keeps `|| true` (consumers' `node_modules` have no `.git`, lefthook isn't a runtime dep); catalog is npm-`private:true` (never installed as a dep — `prepare` runs only on contributor clone + CI, both with `.git`), so per Copilot #7 the `|| true` was dropped to surface real install errors. GitHub visibility (both public) is irrelevant to this.
- Verified live in both repos: secret-grep/validate hooks fire on commit; `yarn verify` (CLI) + `yarn validate` (catalog) green.

### WS7 — done (CLI #57, merged)

- **Dead code removed:** `scoreCatalogItem()` (`score-catalog-item.ts`, no runtime caller) + `recommender/types.ts` (`RecommendationScore`, used only by it).
- **`recommend.ts` 540→353** — extracted `ecosystem.ts` (groups + backend-conflict helpers), `policies.ts` (`UNSUPPORTED`, `matchRequiresAny`, `describeRequiresAny`, `mergeRecommendationWarnings`), `scoring.ts` (`ReasonHit`/`SkipHit`, confidence derivation, `readChangedFiles`). `recommend()` orchestrates. Renamed `blob`→`itemSearchText`.
- **`scan-project.ts` 326→170** — extracted `detection.ts` (dep set, role finalize, detection status, `collectUnsupportedSignals`, `blocked`) + `render.ts` (content-blob index, confidence, summary). Renamed `out`→`depNames`.
- **`task-intent.ts` 395→14 barrel** — split into `task-classification.ts` + `rule-selection.ts`; barrel re-exports the public API so every import path is unchanged.
- **WS9 fold:** `tests/frontmatter-integrity.test.js` asserts `apply` injects no `HAUS-MANAGED` header ahead of a skill/agent's line 1 (would de-register the primitive). Adversarial review confirmed every moved symbol byte-identical, no export dropped, clean DAGs — zero behaviour change.
- **CI catch:** initial test asserted `=== '---'`, which only passed locally (catalog cache shadowed the comment-stub fixtures); reworked to the env-independent "no injected header" invariant. `yarn verify` green (177 tests).

### WS9 — folded, not a standalone PR

Detectability-hardening items landed inside their host workstreams: rules-import/floor-version notes (WS1), `detectionStatus` honesty (WS3), doctor import-bridge check (WS6), frontmatter-integrity guard (WS7). The only deferred item is the **optional `_haus`→sidecar move** (relocate haus's tracking metadata out of the CC-validated `settings.json`) — speculative hardening with real uninstall-migration risk and no current payoff; left as backlog.

---

## ✅ Plan complete

All 10 workstreams merged (WS0, WS1, WS8, WS3, WS4, WS2, WS6, WS5, WS10, WS7); WS9 folded into hosts. Tail backlog: optional `_haus`→sidecar move (low priority, no current need).

---

## Request coverage

Every item asked, mapped to where it's answered.

| Your question                                           | Answer      | Action           |
| ------------------------------------------------------- | ----------- | ---------------- |
| Repo separation complete? move/dedupe?                  | §A.1        | WS8              |
| What gaps exist?                                        | §A.2        | WS1–WS10         |
| What improvements are needed?                           | §A.3        | Part B           |
| Functionality not complete / off-purpose?               | §A.4        | WS1, WS2         |
| Detect every allowed stack with confidence?             | §A.5        | WS3              |
| workflow-config.md without manual fill-in?              | §A.6        | WS4              |
| Own context/memory/token logic vs external?             | §A.7        | WS2              |
| Own guard/security logic vs external?                   | §A.8        | WS1              |
| Auto-run `haus install` on global npm install?          | §A.9        | WS5              |
| UX/UI for non-devs in Claude Code desktop?              | §A.10       | WS6              |
| _(added)_ Files land where CC detects them?             | §A.11       | WS9              |
| _(added)_ Husky → Lefthook? both repos?                 | §A.1 / WS10 | WS10             |
| Code improvements / simplify / structure / names / DRY? | §Dev/code   | WS7 (+WS1/2/3/8) |
| Out of scope: more skills/agents                        | Part E      | —                |

---

## Part A — Audit findings (direct answers)

### 1. Is repo separation complete? Anything to move/dedupe?

Separation is **mostly clean and well-designed**, with one real risk and minor dups.

- ✅ `manifest.json` — catalog is source of truth; CLI gets `library/catalog/manifest.json` as a fixture auto-synced via GitHub Actions (`dispatch-fixture-sync.yml`). Correct.
- ✅ `haus-lock.schema.json` — CLI references the catalog copy by HTTP `$ref`. No duplication.
- ⚠️ **`validation-rules` duplicated in two languages, manual sync** — [src/catalog/validation-rules.ts](../../src/catalog/validation-rules.ts) (CLI) and `scripts/validation-rules.mjs` (catalog) hold identical constants. Header literally says "SYNC REQUIRED … update the other file too." Silent divergence = the CLI enforces stale catalog rules. **→ WS8.**
- ⚠️ **`SENSITIVE` paths duplicated 3× inside the CLI** in three different formats: [src/scanner/scan-project.ts](../../src/scanner/scan-project.ts) (regexes), [src/recommender/recommend.ts](../../src/recommender/recommend.ts) (substrings), [src/security/sensitive-paths.ts](../../src/security/sensitive-paths.ts). **→ WS1.**
- ◽ `agentic-workflow-standard.md` exists twice in the catalog repo (`templates/` + `.claude/WORKFLOW.md`) — benign but manually synced. **→ WS8 (CI guard).**

**Architecture verdict: keep the two-repo split.** It is sound — the catalog releases independently and the CLI fetches it at runtime (pull-based), so content updates reach users without a CLI release. Merging would couple those cadences for no gain. The work is collapsing duplicates to one source, not restructuring.

### 2. What gaps exist?

| Gap                                                                                                 | Evidence                                | Workstream         |
| --------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------ |
| `settings.json` `permissions.deny` never written                                                    | `settings-merge.ts` writes only `hooks` | **WS1**            |
| No explicit "unsupported/unknown stack" signal (Python repo → silent 0.15 confidence)               | `scan-project.ts` confidence fallback   | WS3                |
| `tokenEstimate`/`tokenBudget` carried on all 51 catalog items but never enforced — only printed     | `recommend.ts`, `commands/context.ts`   | WS2                |
| `memory promote` is a no-op log; `memory inject` is a blind `slice(0,1200)` (ignores the task arg)  | `commands/memory.ts`                    | WS2                |
| `"prepare": "husky"` crashes for consumers installing from git (husky absent)                       | `package.json`                          | WS5                |
| No postinstall → `haus install` is manual                                                           | `package.json`                          | WS5                |
| Under-tested internals: scanner detection, recommender scoring, guard invocation, tamper/hash drift | `tests/` (integration-only for these)   | woven into each WS |

### 3. What improvements are needed?

Auto-fill `workflow-config.md` (WS4); data-driven detection registry (WS3); real token-budget enforcement in the router (WS2); non-dev UX surfaces (WS6); full-auto install (WS5); code structure cleanup (WS7). Detailed in Part B.

### 4. What functionality is not complete / not living up to its purpose?

- **Memory subsystem** — advertised as memory/learning; actually 4 boilerplate markdown files + concat + a `slice()`. No dedup, compaction, conflict-resolution, or auto-learning. Claude Code **native memory** (the `MEMORY.md` index + per-fact files this very session uses) already does this better. **Verdict: replace storage, keep nothing but conventions.** (WS2)
- **"Token optimization"** — the only real mechanism is the task-intent filter; the rest is a truncation. Budget fields are inert. **Verdict: make it real by enforcing `tokenBudget` in the router.** (WS2)
- **Security guards** — 12 substring tokens + ~19 naive path patterns + 3 regexes. Bypassable (`rm  -rf`, aliases, `$()`), no entropy detection, no severity, no extensibility. **Verdict: keep the PreToolUse hook _seam_ (real-time agent guardrail — irreplaceable for non-devs), move the static NEVER rules to `permissions.deny`, delegate secret _scanning_ to gitleaks.** (WS1)
- **Task-intent router** ([src/recommender/task-intent.ts](../../src/recommender/task-intent.ts)) — this is the crown jewel and **complete + worth keeping/investing**. Nothing external knows the Haus catalog, so nothing external can route a task to the right ~8 of 51 items.

### 5. Detect every allowed stack with confidence? → WS3 (Hybrid registry)

Today detection is hand-coded `if (deps.includes(...))` chains; comprehensive (~25 roles, ~50 stacks) but not self-verifying and silent on unsupported stacks. Plan: a typed `DetectionRule[]` registry, **dependency signals derived from the catalog manifest** (scanner & catalog can't drift), file/content rules kept in CLI (manifest has none), an explicit `detectionStatus: supported|partial|unknown`, and a **coverage test asserting every allowed stack is detectable** — which fails the moment a new catalog skill ships a stack the scanner can't see.

### 6. Auto-fill `workflow-config.md` without manual entry? → WS4 (Yes, mostly)

Current writer ([src/claude/write-workflow-config.ts](../../src/claude/write-workflow-config.ts)) auto-fills only package manager + test/audit commands; everything else is an HTML-comment placeholder. Plan: a script-first `deriveWorkflowConfig()` that reads real `package.json` scripts and config files to fill typecheck, lint, lint-fix, format-check, E2E, validation library, pre-commit tool, and doc paths. Genuinely un-inferable fields (highest-stakes logic) stay an honest "(fill in — not auto-detectable)" rather than a wrong guess.

### 7. Own context/memory/token logic, or external? → **Hybrid** (WS2)

Delete the thin memory store; adopt Claude Code native memory + a catalog `memory-conventions` doc; **keep and extend** the task-intent router (add token-budget enforcement). Lost if replaced: the 4-file taxonomy (reproducible as `MEMORY.md` headings) and a redaction regex (covered by the hook-time redactor). Low loss for this audience. The **`haus context` UserPromptSubmit hook** (task-scoped rule injection) is the _context-optimization_ mechanism and is **retained** — token-budget enforcement (WS2) makes what it injects leaner, which is the real optimization win.

### 8. Own guard/security logic, or external? → **Hybrid** (WS1)

Keep the PreToolUse hook seam (gates the agent in real time — gitleaks/Lefthook only fire at commit and never see agent _reads_). Move static NEVER rules into `permissions.deny` (also PreToolUse-time, CLI-owned, harder to bypass). Delegate commit-time secret scanning to gitleaks via a catalog Lefthook template. Net: enforcement timing justifies a CLI layer; the regex detection technique does not.

### 9. Auto-run `haus install` on global npm install? → **Full auto** (WS5)

`scripts/postinstall.mjs` invoking the CLI by absolute path (not via PATH). Per the decision it also merges hooks, but stays non-fatal (`|| true` + try/catch), idempotent (already hash-based), global-only (`npm_config_global`), CI-skipping, with a `HAUS_NO_POSTINSTALL` escape — and **prints a clear notice of every file/setting it touched** since it edits `~/.claude/settings.json` silently. Also fixes the latent `prepare: husky` crash.

### 10. UX/UI for non-developers in Claude Code desktop? → WS6

**Reframe: a non-developer in Claude Code desktop lives in the chat pane.** They never open a terminal, never type a `haus` command, never read JSON. The _agent_ runs haus on their behalf; the human reads plain language and clicks **Approve**. Every UX lever must optimize that loop. The current design (terminal commands + inquirer Q&A + raw `repo-summary.md`) is built for a developer at a shell — wrong surface for this audience.

The desktop journey we must make frictionless:

1. **Open project → discover haus.** Today nothing tells a non-dev haus exists. Fix: install seeds **global slash commands** (`~/.claude/commands/*.md`) so `/haus-setup` shows in the `/` menu of _every_ project before any setup, plus a "Driving haus" block in the managed rule so plain English ("set up my project") also triggers it — no new skill needed.
2. **Run setup → conversational, not terminal.** The `/haus-setup` command tells the agent to run `haus setup-project --json` under the hood, translate detection to plain language, ask the guided questions as chat, then apply.
3. **Approve changes → minimal prompts.** Non-devs panic at "Allow haus to run?" on every step. Install/apply pre-allowlists haus's own commands in `permissions.allow` (scoped, pairs with WS1's deny).
4. **Understand result → plain chat + readable files.** Friendly role labels, a one-line doctor verdict, **plain-language guard-block messages** (non-devs _will_ hit these), and a clear "✅ configured" signal. Generated files they might open (`project.md`, `workflow-config.md`) get de-jargoned headers.

Detailed in WS6.

### 11. Do files land where Claude Code can actually detect/use them?

Audited every haus write path against Claude Code's real discovery rules (confirmed against official docs). **Verdict: placements are mostly correct — no dead locations — with a few robustness gaps, not breakage.** Two things haus gets right that are easy to get wrong: agent files are **flat** `.claude/agents/<name>.md` (exactly what CC discovers — _not_ nested `<id>/AGENT.md`), and skills/agents are copied **as-is with no header prepended**, so their YAML frontmatter stays at line 1 and parses.

| Artifact                                  | haus writes to                               | CC detects?                                                    | Verdict                                                                                                     |
| ----------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Global skills (`install`)                 | `~/.claude/skills/<name>/SKILL.md`           | Yes (personal skills)                                          | ✅                                                                                                          |
| Hooks (`install`/`apply`)                 | `settings.json` `hooks` (user + project)     | Yes; schema matches                                            | ✅ (minor: non-standard `_haus` key)                                                                        |
| Project skills (`apply`)                  | `.claude/skills/<name>/SKILL.md`             | Yes (project skills)                                           | ✅                                                                                                          |
| Agents (`apply`)                          | `.claude/agents/<name>.md` **flat**          | Yes (flat + frontmatter)                                       | ✅                                                                                                          |
| Slash commands (`apply`)                  | `.claude/commands/<name>.md` **flat**        | Yes                                                            | ✅                                                                                                          |
| Rules (`apply`)                           | `.claude/rules/haus.md`, `security.md`       | Yes — native `.claude/rules/` auto-load (no `paths` → startup) | ⚠️ version-dependent; load-bearing `security.md` has no fallback                                            |
| Root import (`apply`)                     | `./CLAUDE.md` with `@.haus-workflow/*` block | Yes — root CLAUDE.md + `@imports` at startup                   | ✅ — the _only_ bridge for `.haus-workflow/*`                                                               |
| WORKFLOW / workflow-config / project      | `.haus-workflow/*.md`                        | Only via the `@import` above                                   | ✅ via import; ⚠️ fragile if block removed / paths drift                                                    |
| context-map / lock / scan-hashes / config | `.haus-workflow/*.json`                      | No (haus-internal)                                             | ✅ by design — not for CC                                                                                   |
| Templates (`apply`)                       | `.claude/templates/<name>.md`                | **No** native detection                                        | ◽ reference-only by design; same content reaches context via the WORKFLOW.md import                        |
| Old memory store                          | `.haus-workflow/memory/*.md`                 | **No** native detection (only via inject hook)                 | ❌ wrong place for native use — native memory is `~/.claude/projects/<project>/memory/`; **WS2 deletes it** |

**Robustness items (→ WS9):**

- **`.claude/rules/` is version-dependent.** Native auto-load of `rules/*.md` exists only on Claude Code versions that support the convention; older clients silently ignore it, dropping the advisory `security.md`. (Deterministic `permissions.deny` from WS1 still holds — defense in depth — but the advisory rule could vanish unnoticed.)
- **`.haus-workflow/*` reaches context through ONE bridge** — the CLAUDE.md `@import` block. If a user edits CLAUDE.md and drops the block, or a path drifts, those files silently leave context with no warning today.
- **Frontmatter integrity is correct but unguarded** — nothing stops a future change from prepending a `HAUS-MANAGED` comment to `SKILL.md`/agent files, which would push frontmatter off line 1 and silently de-register them.
- **`_haus` namespace** is written into the CC-validated `settings.json`; tolerated today (unknown keys ignored) but non-standard.

### Dev/code

- **Code improvements** — write the missing `permissions.deny`; consolidate the 3× `SENSITIVE` and 2× `validation-rules`; build the content index once instead of re-reading up to 300 files _per needle_ (`hasNeedle`); enforce token budget. (WS1/WS2/WS3/WS8)
- **Simplify** — replace ~90 lines of detection `if`-chains with one registry evaluator (WS3); delete dead code: `scoreCatalogItem()` in [src/recommender/score-catalog-item.ts](../../src/recommender/score-catalog-item.ts) is never called (scoring is inlined in `recommend.ts`). (WS7)
- **Structure** — split the three large files: `recommend.ts` (524) → scoring / ecosystem / policies; `scan-project.ts` (426) → detection / render / hash; `task-intent.ts` (345) → classification. (WS7)
- **Names** — `blob` → `itemSearchText`; `out` → `detectedStacks`; standardize `rec` vs `recommendation`; reconcile `sourceFiles`/`files`/`safeFiles`/`candidateFiles`. (WS7)
- **DRY** — covered by the consolidations above; biggest wins are `SENSITIVE` (3→1) and `validation-rules` (2→1).

---

## Part B — Remediation workstreams

Each workstream = one branch → one PR → merge before the next (CLAUDE.md "no stacking"). All new code ships with tests (WORKFLOW.md testing gate). Acceptance criteria are testable; verification commands are exact.

### WS1 — Security: write `permissions.deny`, consolidate `SENSITIVE`, delegate scanning ⭐ highest value

**Changes**

- [src/install/settings-merge.ts](../../src/install/settings-merge.ts): write a managed `permissions.deny` array under the existing `_haus` tracking namespace (same keep/strip discipline as hooks). Seed from `buildDenyRules()` (derived from `dangerous-commands` + `sensitive-paths`). **Correct CC syntax:** Bash = `Bash(rm -rf:*)` (prefix); file tools = gitignore globs `Read(*.pem)` / `Write(.env)` / `Read(secrets/**)` — NOT `:*`.
- Consolidate `SENSITIVE` to one canonical source in [src/security/sensitive-paths.ts](../../src/security/sensitive-paths.ts); import it in `scan-project.ts` (keep anchored-regex semantics) and `recommend.ts`.
- Shrink the guard hook lists ([src/security/guard-bash.ts](../../src/security/guard-bash.ts), [src/security/guard-file-access.ts](../../src/security/guard-file-access.ts)) to the genuinely _dynamic_ backstop; let `permissions.deny` own the static cases. Keep the PreToolUse seam + [src/security/redact-sensitive.ts](../../src/security/redact-sensitive.ts) (hook-time redaction).
- **Keep** `secret-patterns.ts` + `redact-sensitive.ts` — they power _hook-time_ redaction, a different job. Add **commit-time** secret _detection_ as a NEW capability via catalog template `haus.lefthook-security` (a `lefthook.yml` with a gitleaks stage + the WORKFLOW.md grep fallback) — allowed under "config + docs OK". This adds coverage; it does not replace existing code.

**Acceptance**: `haus install` produces a `settings.json` containing `permissions.deny` with the NEVER rules; `guardBash('rm -rf /')` and `guardFileAccess('.env')` return a deny; only one `SENSITIVE` definition exists. **Verify**: `tests/deny-rules.test.js`, `tests/guard.test.js` (real invocation, not source-presence); `yarn verify`.

### WS8 — Repo separation: single source for `validation-rules` + workflow standard

**Changes**

- **Make the rules a shared data file, not parallel code.** Catalog owns canonical `validation-rules.json`; the CLI receives it as a **synced fixture** (the same proven mechanism as `manifest.json`). `src/catalog/validation-rules.ts` and `scripts/validation-rules.mjs` both become **thin loaders** of that JSON — no rule constants live in two languages anymore. A CI divergence check stays as a cheap backstop.
- **Workflow standard:** in the catalog, make `.claude/WORKFLOW.md` a generated copy of (or CI-checked against) `templates/agentic-workflow-standard.md` so the two can't drift.

**Acceptance**: editing a rule in `validation-rules.json` changes both consumers with no hand-edit; CI divergence check red when the fixture is stale. **Verify**: change a forbidden tag in the JSON → both `haus validate-catalog` and `node scripts/validate.mjs` reflect it; divergence test green when synced.

### WS3 — Detection registry (hybrid, data-driven)

**Changes**

- New [src/scanner/detection-registry.ts](../../src/scanner/detection-registry.ts): typed `DetectionRule[]` (signals: `dependency`, `packageNamePattern`, `file` glob, `content` needle; `any`/`all` groups, e.g. shadcn = `components.json` AND `class-variance-authority`) + a `runDetection()` evaluator.
- New [src/scanner/derive-from-manifest.ts](../../src/scanner/derive-from-manifest.ts): project each catalog item's `dependency`/`packageNamePattern` clauses into rules; merge `[...static, ...derived]`, dedup by `(stack, signal)`.
- Refactor `detectRoles`/`detectStacks` in `scan-project.ts` to call `runDetection()`. Build the content index **once** (fixes per-needle re-reads).
- Add `detectionStatus: 'supported'|'partial'|'unknown'` + `unsupportedSignals: string[]` to `ContextMap` ([src/types.ts](../../src/types.ts)). Detect unsupported stacks by **presence** of marker files (`requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`) — add to `SAFE_FILES`, never read their contents.
- **Coverage test** asserting every allowed stack is produced by ≥1 rule — deriving the allowed-stack list **from the bundled `manifest.json`** (the stack tokens across catalog items), _not_ a hand-maintained file, so the check can't itself become a drift source. (No new `allowed-stacks.json`.)
- `recommend.ts`: read `detectionStatus` to short-circuit unsupported repos with one clear message; keep `UNSUPPORTED` as defense-in-depth.

**Acceptance**: coverage test green; a Python-only fixture → `detectionStatus: unknown`, `unsupportedSignals: ['python']`; adding a manifest item with a new `dependency` makes the scanner detect it with no scanner edit. **Verify**: `tests/detection-registry.test.js`, new fixture `tests/fixtures/repos/python-only`, `yarn test`.

### WS4 — Auto-fill `workflow-config.md`

**Changes**

- New [src/claude/derive-workflow-config.ts](../../src/claude/derive-workflow-config.ts): script-first inference (prefer the real `package.json` script; only reconstruct a command when the config/dep is present). Fields: typecheck, lint, lint-fix, format-check, E2E (playwright/cypress config), validation library (zod/yup/joi/valibot/class-validator), pre-commit tool (`lefthook.y*ml` / `.husky/` / `prepare~=husky` / `.pre-commit-config.yaml`), doc paths (glob `docs/SPEC.md` etc.). Un-inferable (highest-stakes logic) → honest "(fill in — not auto-detectable)".
- `write-workflow-config.ts` consumes derived values. Keep **write-once**; add `haus apply --refill-config` (matches by stable field labels, fills only still-blank placeholder lines, never touches user edits).
- `doctor.ts`: warn on N unfilled fields.

**Acceptance**: on a repo with eslint+prettier+playwright+zod, the generated config has real commands, not placeholders; `--refill-config` fills blanks only. **Verify**: `tests/derive-workflow-config.test.js`; manual `yarn dev apply --write` on a fixture.

### WS2 — Memory: delete the thin store, keep+extend the router

**Changes**

- Delete `src/memory/memory-store.ts`, `src/memory/redact-memory.ts`, `src/commands/memory.ts`; remove the `haus memory inject` line from `CANONICAL_HOOKS` in [src/claude/load-hooks.ts](../../src/claude/load-hooks.ts); drop the `memory` command registration in `cli.ts`; remove the now-dead `memoryInject` gate from `commands/config.ts` + `load-hooks-config` (audit for other `memory*` references so nothing dangles).
- Catalog: add `haus.memory-conventions` doc → use native `MEMORY.md` + reference `anthropic-skills:consolidate-memory` for periodic merge (allowed under "config + docs OK").
- **Keep & extend** [src/recommender/task-intent.ts](../../src/recommender/task-intent.ts): enforce `tokenBudget` in `pickTaskRelevantRules()` — once cumulative `tokenEstimate` exceeds budget, drop the lowest-scoring rules (~20 lines). Makes "token optimization" real.

**Acceptance**: `haus memory*` commands removed; native-memory conventions documented; router respects a token budget. **Verify**: update `tests/task-intent.test.js` with a budget case; remove `tests/memory.test.js`; `yarn verify`.

### WS6 — Non-developer UX in Claude Code desktop

**Mental model (governs every change below):** the non-dev never leaves the chat pane. The agent runs every `haus` command; the human reads plain language and clicks Approve. Success = a fresh, un-set-up project reaches "configured + healthy" through chat alone — no terminal, no JSON, ≤1 approval prompt, ending in a plain-language confirmation. Where Claude Code desktop mechanics are named below, they are: slash commands from `~/.claude/commands/*.md` (global) and `.claude/commands/*.md` (project); `permissions.allow`/`deny` in `settings.json`; managed rules auto-loaded into context; PreToolUse hooks that fire silently.

**a. Discovery — global slash commands in the `/` menu.**
Install seeds `~/.claude/commands/` so haus commands appear in _every_ project's slash menu, including before first setup (the bootstrap entry). Ship `library/global/commands/haus-setup.md`, `haus-doctor.md`, and `haus-fix.md` (the last runs `haus doctor` then applies the suggested fixes); reuse the existing per-project `/haus-doctor` content globally. Requires [src/install/apply.ts](../../src/install/apply.ts) `collectSourceFiles` to also copy `commands/*.md` → `~/.claude/commands/` (new `command.*` stableId namespace, same skip/overwrite/manifest guards). _Note the distinction:_ project `.claude/commands/` is written by `apply` (post-setup); global `~/.claude/commands/` is seeded by `install` (pre-setup) — the latter is what makes haus discoverable to a non-dev who hasn't run anything yet.

**b. Natural-language trigger without a new skill.**
A non-dev is as likely to type "set up my project" as to find the slash menu. Enrich the **already-written** managed rule `.claude/rules/haus.md` (and the global `~/.claude/CLAUDE.md` seeded by install) with a short _"Driving haus"_ block: "When the user asks to set up / configure / health-check / fix the project, run `haus setup-project` / `haus doctor` and narrate the results in plain language." Because rules load into context, this makes natural language work — and it's guidance in an existing managed file, **not** a new skill or agent.

**c. Conversational setup — zero terminal, zero inquirer.**
`haus-setup.md` is a thin command wrapper (no new logic) instructing the agent to: run `haus setup-project --fast --json`, translate detection to plain language ("a Next.js website using Yarn; I found unit tests but no end-to-end tests"), ask the guided questions as chat, write answers to `setup-answers.json`, run `haus apply --write`, and finish with the doctor verdict. `runSetupProject --json` already bypasses inquirer; small change in [src/commands/setup-project.ts](../../src/commands/setup-project.ts): read guided answers from `setup-answers.json`/env so the agent supplies them conversationally. The terminal inquirer path stays for CLI users.

**d. Kill permission friction.**
A non-dev faced with "Allow haus to run?" on every step will stall or bail. `haus install`/`apply` adds haus's own commands to `permissions.allow` in `settings.json` — **scoped, not blanket**: `Bash(haus setup-project:*)`, `Bash(haus apply:*)`, `Bash(haus doctor:*)`, `Bash(haus scan:*)`, `Bash(haus context:*)`. Written by [src/install/settings-merge.ts](../../src/install/settings-merge.ts) under the `_haus` namespace — same code path and PR coordination as WS1's `permissions.deny`.

**e. Plain language everywhere the human reads.**

- New [src/scanner/role-labels.ts](../../src/scanner/role-labels.ts) friendly map (`vendure-plugin` → "a Vendure plugin"); `renderSummary` → a plain-language paragraph incl. `detectionStatus` ("I couldn't fully recognise this stack" when `unknown`).
- `doctor.ts` → a single green/amber verdict line ("✅ Your project is set up and healthy" / "⚠️ 2 things need attention") mapping each WARN/FAIL to a sentence + the exact fix command; keep the detailed output beneath for devs.
- **Guard-block messages** — non-devs _will_ trigger these, and "PreToolUse deny: SENSITIVE*PATH match" is alarming and opaque. Rewrite the deny reasons in `guardBash`/`guardFileAccess` and the WS1 `permissions.deny` rationale as plain sentences: "I didn't run that — it permanently deletes files" / "I didn't open that file because it looks like it holds secrets." Security clarity first: still say \_what* was blocked. (Spans WS1.)

**f. Done/healthy signal + readable generated files.**
Setup ends with one chat line: "✅ Your project is configured — I added N guardrails and M coding helpers. Run `/haus-doctor` any time to re-check." De-jargon the headers of files a curious non-dev may open (`project.md`, `workflow-config.md`) in [src/claude/write-project-facts.ts](../../src/claude/write-project-facts.ts) / [src/claude/write-workflow-config.ts](../../src/claude/write-workflow-config.ts).

**Acceptance**: from a fresh desktop session in an un-set-up repo, a non-dev who either types `/haus-setup` _or_ says "set up my project" reaches a configured + healthy state through chat only — no terminal, ≤1 approval prompt — ending in a plain-language confirmation; a blocked dangerous action shows a plain-language reason. **Verify**: `tests/commands-install.test.js` (global commands copied + manifested, `permissions.allow` written); `tests/guard.test.js` (plain-language deny messages); manual desktop walkthrough recorded in the PR.

**Skeptical points** (questioning the design):

- **Scoped allowlist, not `Bash(haus:*)`** — a blanket allow is over-broad; enumerate the known subcommands so a future/unknown haus subcommand still prompts.
- **Natural-language trigger depends on the rule being in context** — if the user has trimmed/compacted context it may not fire; the slash command is the reliable fallback, so ship both.
- **Plain-language guard messages must stay unambiguous** — brevity must not hide _what_ was blocked; security clarity wins over friendliness.
- **If the team rejects global commands**, fallback = project-level `.claude/commands/` written by `apply` (already the pattern for `haus-doctor`) + a README "drive haus from desktop" section — weaker discovery, zero new global artifacts.
- **This WS depends on WS3** (`detectionStatus`) for honest narration and **shares `settings-merge.ts` with WS1** — coordinate the two edits.

### WS5 — Full-auto install on global npm install

**Changes**

- New `scripts/postinstall.mjs` (plain Node, added to `package.json#files`): resolve `dist/cli.js` via `import.meta.url`, run `install --postinstall`. Per decision, the postinstall path **does** merge hooks.
- `package.json`: `"postinstall": "node ./scripts/postinstall.mjs || true"`; fix `"prepare": "husky || true"`.
- Gates (fail-open to safe no-op): only when `npm_config_global === 'true'`; skip on `CI` / `HAUS_NO_POSTINSTALL=1`; skip if `dist/cli.js` missing or running inside the package's own repo. Double non-fatal: `|| true` + try/catch → `exit(0)`.
- Because it silently edits `~/.claude/settings.json`, **print a clear notice**: every skill installed + that hooks were merged + how to undo (`haus uninstall`).

**Acceptance**: `npm i -g` (global) runs install once, idempotently, non-fatally, and prints what changed; a local repo `npm install` does **not** trigger it; `HAUS_NO_POSTINSTALL=1` skips. **Verify**: `tests/postinstall.test.js` (gate logic); manual `npm pack` + global install of the tarball in a sandbox.

### WS7 — Code-quality cleanup (do last; lowest behavioral risk, largest diff)

**Changes**

- Delete dead `scoreCatalogItem()` (`score-catalog-item.ts`) after confirming no caller.
- Split: `recommend.ts` → scoring / ecosystem / policies modules; `scan-project.ts` → detection (now the registry) / render / hash; `task-intent.ts` → classification module.
- Rename: `blob`→`itemSearchText`, `out`→`detectedStacks`; standardize `rec`→`recommendation`; reconcile the `*Files` names.

**Acceptance**: behavior unchanged, files smaller, names consistent. **Verify**: `yarn verify` green (refactor is covered by the richer suite added in WS1–WS6).

### WS9 — Claude Code detectability hardening

Small fixes from the placement audit (§A.11). Each rides the WS that touches the same file; WS9 is the tracking home.

- **Rules robustness (load-bearing security).** `.claude/rules/*.md` auto-loads only on CC versions supporting the convention. Document a floor CC version in the README, and add `.haus-workflow`-style insurance for the one rule that must not silently vanish: include `.claude/rules/security.md` in the root-CLAUDE.md `@import` block (accept a small duplicate-load on modern CC, or gate it behind detected version). Files: [src/claude/write-root-claude-md.ts](../../src/claude/write-root-claude-md.ts), README. _(Coordinate with WS1.)_
- **Frontmatter-integrity guard.** Add a test asserting haus never writes any content before the YAML `---` in `.claude/skills/*/SKILL.md` or `.claude/agents/*.md`; a regression there silently de-registers the skill/agent. Files: new test + an assertion in [src/claude/write-claude-files.ts](../../src/claude/write-claude-files.ts). _(Fold into WS7.)_
- **Import-bridge check in doctor.** `haus doctor` verifies the `HAUS:BEGIN` block exists in `CLAUDE.md` and each `@.haus-workflow/*` target file resolves — so the sole bridge into context can't break unnoticed. Files: [src/commands/doctor.ts](../../src/commands/doctor.ts). _(Fold into WS6 doctor work.)_
- **Native memory path (WS2 refinement).** Native memory is `~/.claude/projects/<project>/memory/MEMORY.md`, not in-project. The `haus.memory-conventions` doc must point there; optionally set `autoMemoryDirectory` in `settings.json` if Haus wants memory kept inside the repo. _(Folds into WS2.)_
- **Optional — move `_haus` tracking out of `settings.json`** into a `.haus-workflow/` sidecar so haus never writes a non-standard key into a Claude-validated config. Low priority.

**Acceptance**: doctor flags a missing/broken import block; frontmatter-guard test green; README states the floor CC version for `.claude/rules/`. **Verify**: doctor + frontmatter tests; manual check that `security.md` is in context (natively or via import).

### WS10 — Dogfood Lefthook (CLI switch + minimal catalog hook)

**Finding:** the shipped standard (`.claude/WORKFLOW.md`) mandates **Lefthook** ("Go binary, faster than Husky", `fail_text` for _agent-readable_ hook output) and WS1 ships a `haus.lefthook-security` template to users — yet `haus-workflow` uses **Husky** (`prepare: husky`; `.husky/pre-commit` = `yarn lint-staged`; `.husky/pre-push` = `yarn typecheck && yarn test`) and `haus-workflow-catalog` has **no local hooks** (CI-only). Practice contradicts the pitch.

**CLI (`haus-workflow`): switch Husky → Lefthook — confirmed.**

- Add `lefthook.yml`: `pre-commit` (`parallel: true`) = lint + format on `{staged_files}` (`stage_fixed: true`) + `typecheck` + secret-scan (**gitleaks, reusing the exact WS1 `haus.lefthook-security` stage** → haus runs the config it ships); `pre-push` = `yarn test`. Every command gets an agent-readable `fail_text`. _(Depends on WS1 for the gitleaks stage; if WS1 hasn't landed, inline a minimal gitleaks invocation.)_
- Remove devDeps `husky` + `lint-staged` and the `lint-staged` block; add `lefthook`; delete `.husky/`.
- `"prepare": "lefthook install || true"` — the `|| true` also resolves the WS5 latent crash for git-install consumers (switching tools alone does _not_ fix it).
- Update `.claude/workflow-config.md` pre-commit tool → Lefthook (removes the dogfooding contradiction).
- _Option:_ keep `typecheck` on pre-push (current behavior) if per-commit latency matters; the standard puts it on pre-commit.
- **Acceptance**: a staged lint error blocks commit with its `fail_text`; push runs tests; `yarn verify` green. **Verify**: stage a bad file → commit blocked; manual hook run.

**Catalog (`haus-workflow-catalog`): add a minimal Lefthook hook — confirmed.**

- CI (`validate.yml`) already gates `yarn validate` + version checks on every push/PR (correctness floor unchanged); the local hook adds fast feedback — catch a broken manifest/format before the CI round-trip — and dogfoods the standard.
- Add `lefthook.yml`: `pre-commit` (`parallel: true`) = `yarn validate` + `yarn format:check` (or `format` with `stage_fixed: true`), each with an agent-readable `fail_text`.
- `"prepare": "lefthook install"` (safe — `private: true`, contributors only); add `lefthook` devDep. Keep CI as-is — the hook is fast local feedback, not a CI replacement.
- **Acceptance**: committing a manifest that fails `yarn validate` is blocked locally with its `fail_text`; format issues caught pre-commit; CI still green on push. **Verify**: stage an invalid manifest edit → commit blocked; push → CI passes.
- **Sequencing**: land after the CLI switch so both repos adopt Lefthook consistently.

---

## Part C — Sequencing

Constraint (CLAUDE.md): one PR per branch, merge to `main` before the next — no stacking. Shared-file couplings drive the order: `settings-merge.ts` is touched by WS1 + WS6(d); `SAFE_FILES` by WS3 + WS4; `package.json` by WS5 + WS10; `detectionStatus` (WS3) is consumed by WS4 + WS6.

**WS9 and the catalog half of WS10 are tracking items, not separate branches — they fold into a host PR.** Actual PR sequence:

| #   | PR                                                                                                          | Folds in                                | Depends on                                      | Effort |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------- | ------ |
| 1   | **WS1** — `permissions.deny` + `SENSITIVE` 3→1 + dynamic guard backstop + `haus.lefthook-security` template | WS9 rules-import & README floor-version | —                                               | M      |
| 2   | **WS8** — `validation-rules` → shared JSON + synced fixture                                                 | —                                       | —                                               | S      |
| 3   | **WS3** — detection registry + `detectionStatus` + unsupported signal                                       | —                                       | reads `manifest.json`                           | L      |
| 4   | **WS4** — `workflow-config.md` auto-fill                                                                    | —                                       | WS3 (`SAFE_FILES`)                              | M      |
| 5   | **WS2** — delete memory store + token-budget in router                                                      | WS9 native-memory path                  | —                                               | M      |
| 6   | **WS6** — non-dev desktop UX                                                                                | WS9 doctor import-check                 | WS1 (`settings-merge`), WS3 (`detectionStatus`) | L      |
| 7   | **WS5** — full-auto postinstall + `prepare` fix                                                             | —                                       | —                                               | M      |
| 8   | **WS10** — CLI Husky→Lefthook (+ catalog hook as a separate catalog-repo PR)                                | —                                       | WS5 (`package.json`), WS1 (gitleaks stage)      | S      |
| 9   | **WS7** — code-quality cleanup: file splits, renames, dead code                                             | WS9 frontmatter-guard                   | richer test suite from PRs 1–8                  | M/L    |

Tail (low priority, any time): WS9's optional `_haus`→sidecar move.

**Independent streams** (could be parallel branches if no-stacking were relaxed): WS8, WS5, WS10 don't touch the WS3→WS4→WS6 chain. WS1 must land first regardless (WS6 depends on it). Run `/compact` between PRs; **checkpoint before WS5** (postinstall) **and WS7** (large refactor).

---

## Part D — Verification (end-to-end)

Per workstream: the named tests + `yarn verify` (typecheck + typecheck:scripts + lint + build + test). Plus full-pipeline checks:

- **Scan/recommend/write**: `yarn dev setup-project --fast --json` on each `tests/fixtures/repos/*` (incl. the new `python-only`) → assert `detectionStatus`, recommendation shape, and generated `.claude/`/`.haus-workflow/` files.
- **Security**: after `yarn dev apply --write`, assert `.claude/settings.json` contains `permissions.deny`; assert guards deny on known-bad inputs.
- **Install**: `npm pack`, then `npm i -g ./<tarball>` in a throwaway HOME → assert `~/.claude/skills`, `~/.claude/commands`, merged hooks, manifest, and the printed notice; re-run → idempotent; `HAUS_NO_POSTINSTALL=1` → no-op.
- **Desktop UX**: run `/haus-setup` in Claude Code desktop against a sample repo → confirm plain-language narration, guided answers, and a single doctor verdict line.
- **Regression**: `yarn verify` green at the end of every workstream before merge.

---

## Part E — Out of scope (per request)

Adding new pattern skills or review agents to the catalog. (Config templates and conventions docs are in scope per the decision above.)
