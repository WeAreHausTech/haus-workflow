# Repo Cleanup & Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead scanner modules and brittle tests, consolidate 27 docs to 3 + README, and add inline JSDoc throughout `src/` so the repo is comprehensible.

**Architecture:** Single branch `cleanup/repo-structure`. Four passes executed in order: (1) delete dead code, (2) prune tests, (3) consolidate docs + rewrite README, (4) add inline docs module by module. No functional changes — `yarn test` must pass after each task.

**Tech Stack:** TypeScript, Node.js built-in test runner, tsup, tsx, yarn

---

### Task 1: Create cleanup branch

**Files:** none

- [ ] **Step 1: Create and switch to the cleanup branch**

```bash
git checkout -b cleanup/repo-structure
```

- [ ] **Step 2: Verify clean state**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

---

### Task 2: Delete dead scanner modules

Nine scanner files exist but are never imported. All functionality is re-implemented inline in `scan-project.ts`. `detect-package-manager.ts` is still in use — do NOT delete it.

**Files:**
- Delete: `src/scanner/detect-auth.ts`
- Delete: `src/scanner/detect-database.ts`
- Delete: `src/scanner/detect-dotnet.ts`
- Delete: `src/scanner/detect-monorepo.ts`
- Delete: `src/scanner/detect-php.ts`
- Delete: `src/scanner/detect-repo-role.ts`
- Delete: `src/scanner/detect-tests.ts`
- Delete: `src/scanner/dependency-map.ts`
- Delete: `src/scanner/summarize-repo.ts`

- [ ] **Step 1: Verify zero imports for each file before deleting**

```bash
grep -r "detect-auth\|detect-database\|detect-dotnet\|detect-monorepo\|detect-php\|detect-repo-role\|detect-tests\|dependency-map\|summarize-repo" src/ tests/ --include="*.ts" --include="*.js" -l
```

Expected: no output (zero matches).

- [ ] **Step 2: Delete the files**

```bash
rm src/scanner/detect-auth.ts \
   src/scanner/detect-database.ts \
   src/scanner/detect-dotnet.ts \
   src/scanner/detect-monorepo.ts \
   src/scanner/detect-php.ts \
   src/scanner/detect-repo-role.ts \
   src/scanner/detect-tests.ts \
   src/scanner/dependency-map.ts \
   src/scanner/summarize-repo.ts
```

- [ ] **Step 3: Run tests**

```bash
yarn test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead scanner modules"
```

---

### Task 3: Prune brittle tests

Remove golden file tests (snapshot-style, high-maintenance, don't test logic) and any test referencing the now-deleted scanner files.

**Files:**
- Delete: `tests/context-goldens.test.js`
- Delete: `tests/golden/` (entire directory)

- [ ] **Step 1: Verify context-goldens.test.js only references golden/ fixtures**

```bash
head -30 tests/context-goldens.test.js
```

Confirm it reads from `tests/golden/` and does not test any logic kept elsewhere.

- [ ] **Step 2: Delete the golden test file and fixtures**

```bash
rm tests/context-goldens.test.js
rm -rf tests/golden/
```

- [ ] **Step 3: Run tests**

```bash
yarn test
```

Expected: all remaining tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove golden file tests"
```

---

### Task 4: Delete obsolete docs

Remove 20+ doc files that are historical, redundant with CLAUDE.md, or belong to the catalog repo.

**Files to delete:**

```
docs/specs/2026-05-22-b4-remote-catalog-design.md
docs/specs/2026-05-22-plugin-install-verification.md
docs/specs/2026-05-22-repo-state-handover.md
docs/specs/2026-05-25-hook-cost-report.md
docs/specs/2026-05-25-implementation-plan.md
docs/specs/2026-05-26-implementation-plan.md
docs/specs/pre-release-cleanup.md
docs/plugin.md
docs/curated-library.md
docs/curation.md
docs/external-sources.md
docs/contributing.md
docs/commands.md
docs/dependencies.md
docs/validation.md
docs/generated-files.md
docs/updates.md
docs/memory.md
docs/technical-guide.md
docs/detection-improvement-plan.md
docs/setup-guide.md
docs/global-install.md
docs/user-guide.md
```

- [ ] **Step 1: Delete all obsolete docs**

```bash
rm -rf docs/specs/
rm docs/plugin.md docs/curated-library.md docs/curation.md docs/external-sources.md \
   docs/contributing.md docs/commands.md docs/dependencies.md docs/validation.md \
   docs/generated-files.md docs/updates.md docs/memory.md docs/technical-guide.md \
   docs/detection-improvement-plan.md docs/setup-guide.md docs/global-install.md \
   docs/user-guide.md
```

- [ ] **Step 2: Verify remaining docs**

```bash
ls docs/
```

Expected: `architecture.md  cli.md  security.md` (plus `superpowers/` dir).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete docs"
```

---

### Task 5: Update architecture.md

Strip all references to the Claude Code plugin era and the catalog-as-part-of-this-repo framing. This doc is for internal developers.

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Read the current file**

```bash
cat docs/architecture.md
```

- [ ] **Step 2: Remove any sections/paragraphs that reference**
  - "Claude Code plugin" or `plugin/` directory
  - Catalog being local to this repo (it's now a separate repo)
  - Migration guides or historical context
  - Any TODO/FIXME markers

- [ ] **Step 3: Ensure the doc covers**
  - What the CLI does (scan → recommend → write)
  - Module boundaries (commands → core → utils, matching CLAUDE.md)
  - Output files (`.haus-workflow/`, `.claude/`)
  - Key data flow: `scanProject` → `recommend` → `writeClaudeFiles`

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: update architecture.md, remove plugin/catalog-repo references"
```

---

### Task 6: Update cli.md

Strip plugin references. This doc is the internal command reference.

**Files:**
- Modify: `docs/cli.md`

- [ ] **Step 1: Read the current file**

```bash
cat docs/cli.md
```

- [ ] **Step 2: Remove any references to**
  - `haus install` being a plugin installer (it installs global `~/.claude/` assets)
  - Catalog being local (catalog is fetched from separate repo via `haus update`)
  - Any commands that no longer exist
  - Links to deleted doc files

- [ ] **Step 3: Verify all commands in the doc still exist**

```bash
grep -r "export async function run" src/commands/ | sed 's|.*function ||;s|(.*||'
```

Cross-check that every command documented in `cli.md` appears in that list.

- [ ] **Step 4: Commit**

```bash
git add docs/cli.md
git commit -m "docs: update cli.md, strip stale plugin references"
```

---

### Task 7: Verify security.md

Check that `security.md` still accurately describes the guards in `src/security/`.

**Files:**
- Modify: `docs/security.md` (if stale content found)

- [ ] **Step 1: Read the doc and cross-check against actual guard logic**

```bash
cat docs/security.md
cat src/security/guard-bash.ts
cat src/security/guard-file-access.ts
cat src/security/dangerous-commands.ts
cat src/security/sensitive-paths.ts
```

- [ ] **Step 2: Remove any plugin-era or catalog-era references**

- [ ] **Step 3: Commit if changes were made**

```bash
git add docs/security.md
git commit -m "docs: update security.md to reflect current guard logic"
```

---

### Task 8: Rewrite README

Replace the current README with a user-facing entry point: install → usage → general info. Remove all links to deleted docs.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the entire README content with**

```markdown
# haus

CLI that scans a project, recommends AI context assets for the stack, and writes controlled outputs into `.claude/` and `.haus-workflow/`.

> **Internal Haus tool.**

---

## Install

Requires Node 22+.

```bash
npm install -g @haus-tech/haus-workflow
haus install
```

`haus install` seeds `~/.claude/` with Haus-managed skills, agents, and hooks.

---

## Per-project setup

Run once inside each project:

```bash
haus init
```

Scans the repo, recommends context assets, and writes `.claude/` and `.haus-workflow/`.

---

## Commands

```bash
haus init              # first-run setup (scan → recommend → apply)
haus setup-project     # re-run setup on existing project
haus scan              # scan repo and write context-map
haus recommend         # score and recommend catalog items
haus apply --dry-run   # preview what would be written
haus apply --write     # write .claude/ files
haus update            # sync remote catalog + refresh lockfile
haus update --check    # check for updates without applying
haus doctor            # health check: hooks, CLAUDE.md, catalog cache
haus config            # manage hook configuration
haus memory            # view project memory store
haus guard             # test bash/file-access guards
haus uninstall         # remove Haus-managed files from ~/.claude/
```

---

## Development

```bash
yarn install
yarn verify   # typecheck + lint + build + test
yarn dev <cmd>  # run CLI without building (tsx)
```

### Internal docs

- [Architecture](docs/architecture.md)
- [CLI reference](docs/cli.md)
- [Security](docs/security.md)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README as user-facing entry point"
```

---

### Task 9: Inline docs — src/utils/

Foundation layer. Every file gets a module-level comment. Exported functions get JSDoc.

**Files:**
- Modify: `src/utils/logger.ts`
- Modify: `src/utils/paths.ts`
- Modify: `src/utils/fs.ts`
- Modify: `src/utils/exec.ts`
- Modify: `src/utils/audit-checks.ts`
- Modify: `src/utils/diff.ts`
- Modify: `src/utils/prompts.ts`
- Modify: `src/utils/versions.ts`

- [ ] **Step 1: Add docs to `src/utils/logger.ts`**

```typescript
/** Thin wrappers over console — all src/ modules must use these instead of console directly. */

/** Log an informational message to stdout. */
export const log = (msg?: unknown, ...args: unknown[]): void => {
  console.log(msg, ...args); // eslint-disable-line no-console
};

/** Log a warning to stderr. */
export const warn = (msg?: unknown, ...args: unknown[]): void => {
  console.warn(msg, ...args); // eslint-disable-line no-console
};

/** Log an error to stderr. */
export const error = (msg?: unknown, ...args: unknown[]): void => {
  console.error(msg, ...args); // eslint-disable-line no-console
};
```

- [ ] **Step 2: Add docs to `src/utils/paths.ts`**

Add module comment at top:
```typescript
/** Path helpers for resolving .haus-workflow/, .claude/, and package-root locations. */
```

Add JSDoc to each export, for example:
```typescript
/** Resolve a path inside .haus-workflow/ for the given project root. */
export function hausPath(root: string, ...parts: string[]): string { ... }

/** Resolve a path inside .claude/ for the given project root. */
export function claudePath(root: string, ...parts: string[]): string { ... }

/** Return a human-readable relative path, falling back to ~/... or absolute. */
export function displayPath(root: string, targetPath: string): string { ... }
```

- [ ] **Step 3: Add module-level comment and JSDoc to remaining utils files**

Follow the same pattern: one-line module comment at the top, JSDoc on each exported function describing what it does and any non-obvious parameters. Skip trivial re-exports.

Key exports to document:
- `fs.ts`: `readJson`, `writeJson`, `readText`, `writeText`, `listFiles`, `hashText`
- `exec.ts`: `runGit`
- `audit-checks.ts`: `isRecord`
- `diff.ts`: `createUnifiedDiff`, `hasTextChanged`, `summarizeDiff`
- `prompts.ts`: interactive prompt helpers
- `versions.ts`: `satisfiesVersion`, `normalizeVersion`

- [ ] **Step 4: Run typecheck**

```bash
yarn typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/
git commit -m "docs: add inline JSDoc to src/utils/"
```

---

### Task 10: Inline docs — src/scanner/

**Files:**
- Modify: `src/scanner/scan-project.ts`
- Modify: `src/scanner/detect-package-manager.ts`
- Modify: `src/scanner/read-context.ts`
- Modify: `src/scanner/types.ts`

- [ ] **Step 1: Add module comment and JSDoc to `src/scanner/scan-project.ts`**

Add at top of file:
```typescript
/**
 * Core scanner. Reads package.json, composer.json, and safe project files to detect
 * roles, stacks, dependencies, and security risks. Writes context-map.json,
 * dependency-map.json, scan-hashes.json, and repo-summary.md into .haus-workflow/.
 */
```

Add JSDoc to `scanProject`:
```typescript
/**
 * Scan the project at `root` and write context outputs to .haus-workflow/.
 * @param root - Absolute path to the project root.
 * @param mode - "fast" uses cached context if available; "guided" always re-scans.
 */
export async function scanProject(root: string, mode: "guided" | "fast" = "fast"): Promise<ScanResult>
```

Add inline comments to private helpers (`detectRoles`, `detectStacks`, `hasNeedle`, `computeConfidence`, `renderSummary`) where the logic is non-obvious. Example:
```typescript
// Limit file reads to 300 candidates to avoid scanning huge repos
for (const rel of candidates.slice(0, 300)) {
```

- [ ] **Step 2: Add docs to remaining scanner files**

`detect-package-manager.ts` — module comment + JSDoc on `detectPackageManager`.
`read-context.ts` — module comment + JSDoc on `readContextOrScan` (reads cached context-map or triggers a fast scan).
`types.ts` — module comment + JSDoc on `ScanResult` type and its fields.

- [ ] **Step 3: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/scanner/
git commit -m "docs: add inline JSDoc to src/scanner/"
```

---

### Task 11: Inline docs — src/catalog/ and src/memory/

**Files:**
- Modify: `src/catalog/load-catalog.ts`
- Modify: `src/catalog/remote-catalog.ts`
- Modify: `src/catalog/validate-catalog.ts`
- Modify: `src/catalog/validation-rules.ts`
- Modify: `src/catalog/allowed-stacks.ts`
- Modify: `src/catalog/constants.ts`
- Modify: `src/memory/memory-store.ts`
- Modify: `src/memory/redact-memory.ts`

- [ ] **Step 1: Add docs to `src/catalog/load-catalog.ts`**

```typescript
/**
 * Loads catalog items from the local cache (~/.haus-workflow/catalog/manifest.json).
 * Falls back to the bundled library manifest if no cache exists.
 * Test override: set HAUS_FIXTURE_CATALOG env var to a fixture manifest path.
 */

/** Load all catalog items available for the current install. */
export async function loadCatalog(root: string): Promise<CatalogItem[]>
```

- [ ] **Step 2: Add module comment + JSDoc to remaining catalog files**

- `remote-catalog.ts` — fetches manifest from the remote catalog repo via git tag; caches under `~/.haus-workflow/catalog/`.
- `validate-catalog.ts` — validates a catalog manifest against schema and business rules.
- `validation-rules.ts` — individual rule functions used by validate-catalog.
- `allowed-stacks.ts` — defines which stack combinations are permitted for catalog items.
- `constants.ts` — shared string constants (cache paths, catalog ref).

- [ ] **Step 3: Add docs to src/memory/**

`memory-store.ts`:
```typescript
/**
 * Local per-project memory store. Files live at .haus-workflow/memory/.
 * Stores project learnings, decisions, recurring issues, and client context
 * that persist across haus runs.
 */

/** Ensure all memory files exist, creating empty stubs if missing. */
export async function ensureMemory(root: string): Promise<void>

/** Read all memory files concatenated into a single markdown string. */
export async function readMemory(root: string): Promise<string>
```

`redact-memory.ts` — module comment explaining it strips sensitive patterns before memory is surfaced.

- [ ] **Step 4: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/catalog/ src/memory/
git commit -m "docs: add inline JSDoc to src/catalog/ and src/memory/"
```

---

### Task 12: Inline docs — src/security/

**Files:**
- Modify: `src/security/guard-bash.ts`
- Modify: `src/security/guard-file-access.ts`
- Modify: `src/security/redact-sensitive.ts`
- Modify: `src/security/secret-patterns.ts`
- Modify: `src/security/sensitive-paths.ts`
- Modify: `src/security/dangerous-commands.ts`
- Modify: `src/security/types.ts`

- [ ] **Step 1: Add docs to `src/security/guard-bash.ts`**

```typescript
/**
 * Bash guard — blocks commands that match a known dangerous-command list.
 * Called by the `haus guard` command and the Claude Code hooks layer.
 */

/**
 * Check a bash command string against the dangerous-commands list.
 * @returns A human-readable block message if matched, undefined if safe.
 */
export function guardBash(command: string): string | undefined
```

- [ ] **Step 2: Add module comment + JSDoc to remaining security files**

- `guard-file-access.ts` — blocks reads/writes to sensitive path patterns (env files, certs, customer data).
- `redact-sensitive.ts` — strips secret-like patterns from strings before they appear in outputs or memory.
- `secret-patterns.ts` — regex list of patterns that look like secrets (API keys, tokens, passwords).
- `sensitive-paths.ts` — path patterns treated as sensitive by the file-access guard.
- `dangerous-commands.ts` — string tokens treated as dangerous by the bash guard.
- `types.ts` — guard result types.

- [ ] **Step 3: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/security/
git commit -m "docs: add inline JSDoc to src/security/"
```

---

### Task 13: Inline docs — src/recommender/

**Files:**
- Modify: `src/recommender/recommend.ts`
- Modify: `src/recommender/task-intent.ts`
- Modify: `src/recommender/explain-formatters.ts`
- Modify: `src/recommender/explain-recommendation.ts`
- Modify: `src/recommender/score-catalog-item.ts`
- Modify: `src/recommender/types.ts`

- [ ] **Step 1: Add docs to `src/recommender/recommend.ts`**

```typescript
/**
 * Recommender — scores catalog items against a project's context-map and returns
 * ranked recommendations with explainability data.
 * Filters out unsupported stacks, sensitive paths, and ecosystem conflicts.
 */
```

JSDoc on the main export (find the export function name by reading the file):
```typescript
/** Score all catalog items for the given project context and return ranked recommendations. */
export async function recommend(root: string, options?: RecommendOptions): Promise<Recommendation>
```

- [ ] **Step 2: Add module comment + JSDoc to remaining recommender files**

- `task-intent.ts` — classifies the current git branch name / recent commit messages to infer task type (feature, fix, refactor) which biases catalog scoring.
- `explain-formatters.ts` — formats recommendation scores into human-readable explain output.
- `explain-recommendation.ts` — orchestrates the explain flow for a single catalog item.
- `score-catalog-item.ts` — pure scoring function for a single catalog item against a ContextMap.
- `types.ts` — `RecommendationScore` and related types.

- [ ] **Step 3: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/recommender/
git commit -m "docs: add inline JSDoc to src/recommender/"
```

---

### Task 14: Inline docs — src/install/ and src/update/

**Files:**
- Modify: `src/install/apply.ts`
- Modify: `src/install/uninstall.ts`
- Modify: `src/install/manifest.ts`
- Modify: `src/install/settings-merge.ts`
- Modify: `src/install/header.ts`
- Modify: `src/update/apply-updates.ts`
- Modify: `src/update/check-updates.ts`
- Modify: `src/update/diff-generated-files.ts`
- Modify: `src/update/hash-installed.ts`
- Modify: `src/update/lockfile.ts`
- Modify: `src/update/npm-version.ts`
- Modify: `src/update/types.ts`

- [ ] **Step 1: Add docs to `src/install/apply.ts`**

```typescript
/**
 * Applies catalog items to ~/.claude/. Copies files from the bundled library,
 * merges hook settings, writes a manifest for tracking installed paths,
 * and supports dry-run and force modes.
 */

/** Apply (install) the selected catalog items globally. */
export async function applyItems(items: string[], options: ApplyOptions): Promise<void>
```

- [ ] **Step 2: Add docs to `src/install/uninstall.ts`**

```typescript
/** Remove catalog items previously installed to ~/.claude/, using the manifest to find paths. */
```

- [ ] **Step 3: Add module comment + JSDoc to remaining install files**

- `manifest.ts` — reads/writes the install manifest (`~/.claude/.haus-manifest.json`) that tracks which files haus owns.
- `settings-merge.ts` — merges haus hook fragments into `~/.claude/settings.json` without clobbering user settings.
- `header.ts` — builds and parses the `<!-- haus-managed -->` header stamp on generated files.

- [ ] **Step 4: Add module comment + JSDoc to src/update/ files**

- `lockfile.ts` — reads/writes `.haus-workflow/haus.lock.json`, which tracks installed item versions and hashes.
- `hash-installed.ts` — hashes the content of installed files to detect local modifications.
- `check-updates.ts` — compares installed hashes against the remote catalog to find stale items.
- `apply-updates.ts` — fetches new catalog versions and re-applies changed items.
- `diff-generated-files.ts` — diffs current vs new generated file content for update preview.
- `npm-version.ts` — fetches the latest published npm version of `@haus-tech/haus-workflow`.
- `types.ts` — `UpdateDiff` and related types.

- [ ] **Step 5: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/install/ src/update/
git commit -m "docs: add inline JSDoc to src/install/ and src/update/"
```

---

### Task 15: Inline docs — src/claude/

**Files:**
- Modify: `src/claude/write-claude-files.ts`
- Modify: `src/claude/write-project-facts.ts`
- Modify: `src/claude/write-root-claude-md.ts`
- Modify: `src/claude/write-way-of-work.ts`
- Modify: `src/claude/load-hooks.ts`
- Modify: `src/claude/load-hooks-config.ts`
- Modify: `src/claude/verify-hooks-contract.ts`

- [ ] **Step 1: Add docs to `src/claude/write-claude-files.ts`**

```typescript
/**
 * Orchestrates writing all .claude/ outputs for a project: CLAUDE.md, project-facts,
 * way-of-work, and hook settings. Called after scan + recommend.
 * Diffs existing content and only writes when changed.
 */
```

- [ ] **Step 2: Add module comment + JSDoc to remaining claude/ files**

- `write-project-facts.ts` — generates `.claude/project-facts.md` from the scan context (stack, roles, warnings).
- `write-root-claude-md.ts` — generates or updates the root `.claude/CLAUDE.md` with stack-aware guidance.
- `write-way-of-work.ts` — generates `.claude/way-of-work.md` from recommended catalog items.
- `load-hooks.ts` — reads the current Claude hook settings from `~/.claude/settings.json`.
- `load-hooks-config.ts` — loads the haus-managed hook configuration fragment.
- `verify-hooks-contract.ts` — asserts that installed hook settings match the canonical haus contract, used by `haus doctor`.

- [ ] **Step 3: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/claude/
git commit -m "docs: add inline JSDoc to src/claude/"
```

---

### Task 16: Inline docs — src/commands/, src/types/, src/sources/, src/curation/

**Files:**
- Modify: all files in `src/commands/`
- Modify: `src/types/types.ts`
- Modify: `src/library/audit-library.ts`
- Modify: all files in `src/sources/`
- Modify: all files in `src/curation/`

- [ ] **Step 1: Add a module comment to each command file**

Each command file is a thin CLI handler. Pattern:

```typescript
// src/commands/init.ts
/** `haus init` — first-run setup. Delegates to setup-project if .haus-workflow/ does not exist. */
```

```typescript
// src/commands/scan.ts
/** `haus scan` — scan the project and write context-map.json to .haus-workflow/. */
```

Apply this pattern to all 17+ command files. The comment should name the CLI command and describe what it does in one sentence.

- [ ] **Step 2: Add JSDoc to exported run functions in commands**

Each command exports a `run*` function. Add JSDoc to each:

```typescript
/** Run the init command in the current working directory. */
export async function runInit(options: { fast?: boolean; json?: boolean }): Promise<void>
```

- [ ] **Step 3: Add docs to `src/types/types.ts`**

```typescript
/**
 * Core shared types for haus-workflow. Imported across scanner, recommender,
 * catalog, and claude modules.
 */
```

Add JSDoc to each exported type/interface, e.g.:

```typescript
/** Full context map produced by scanProject, written to .haus-workflow/context-map.json. */
export interface ContextMap { ... }

/** A single catalog item — a skill, agent, or template that haus can install. */
export interface CatalogItem { ... }
```

- [ ] **Step 4: Add docs to `src/library/audit-library.ts`**

```typescript
/**
 * Audits the bundled library catalog for correctness: missing files,
 * schema violations, and stale entries. Run during prepack via scripts/.
 */
```

- [ ] **Step 5: Add module comment + JSDoc to all files in `src/sources/`**

`src/sources/` handles external source sync, audit, and reporting — fetching assets from remote locations and verifying they match the catalog. Add a one-line module comment per file and JSDoc on exported functions.

- [ ] **Step 6: Add module comment + JSDoc to all files in `src/curation/`**

`src/curation/` detects unsupported-stack tokens for source-decision validation — used to flag catalog items that reference technologies the project doesn't use. Add a one-line module comment per file and JSDoc on exported functions.

- [ ] **Step 7: Run full verify**

```bash
yarn verify
```

Expected: typecheck + lint + build + test all pass.

- [ ] **Step 8: Commit**

```bash
git add src/commands/ src/types/ src/library/ src/sources/ src/curation/
git commit -m "docs: add inline JSDoc to src/commands/, src/types/, src/library/, src/sources/, src/curation/"
```

---

### Task 17: Final check and push

- [ ] **Step 1: Run full verify one more time**

```bash
yarn verify
```

Expected: all checks pass.

- [ ] **Step 2: Review the diff**

```bash
git log main..HEAD --oneline
git diff main..HEAD --stat
```

Confirm: only deletions and doc additions. No logic changes.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin cleanup/repo-structure
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "chore: repo cleanup — remove dead code, consolidate docs, add inline JSDoc" \
  --body "$(cat <<'EOF'
## Summary
- Remove 9 dead scanner modules (re-implemented inline in scan-project.ts)
- Remove golden file tests (brittle snapshot tests)
- Consolidate 27 docs to README + 3 internal docs (architecture, cli, security)
- Add module-level comments and JSDoc throughout all src/ modules

## No functional changes
All existing tests pass. No logic was modified.
EOF
)"
```
