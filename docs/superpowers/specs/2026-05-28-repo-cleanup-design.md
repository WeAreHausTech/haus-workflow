# Repo Cleanup & Documentation Design

**Date:** 2026-05-28
**Branch:** cleanup/repo-structure
**Approach:** Single comprehensive branch — all cleanup, pruning, doc consolidation, and inline docs in one PR.

---

## 1. Dead Code Removal

Remove 9 dead scanner modules. All carry `TODO(refactor-scanner)` markers; functionality is re-implemented inline in `scan-project.ts`. `detect-package-manager.ts` is still imported and must be kept.

- `src/scanner/detect-auth.ts`
- `src/scanner/detect-database.ts`
- `src/scanner/detect-dotnet.ts`
- `src/scanner/detect-monorepo.ts`
- `src/scanner/detect-php.ts`
- `src/scanner/detect-repo-role.ts`
- `src/scanner/detect-tests.ts`
- `src/scanner/dependency-map.ts`
- `src/scanner/summarize-repo.ts`

Keep: `src/scanner/detect-package-manager.ts` — imported by `scan-project.ts`.

Verify zero imports before each deletion.

---

## 2. Test Pruning

Remove:
- Tests for the 9 dead scanner modules above
- Golden file tests: `tests/golden/` directory + `tests/context-goldens.test.js`
- Any test file that only exercises removed code

Keep:
- All functional/logic tests (recommender, scanner core, catalog, security, memory, install, update, CLI commands)

---

## 3. Docs Consolidation

Context: this repo is no longer a Claude Code plugin; catalog has been split to a separate repo.

**Delete:**
- `docs/specs/` — all 7 files (post-release historical artifacts)
- `docs/plugin.md` — plugin era, outdated
- `docs/curated-library.md`, `docs/curation.md`, `docs/external-sources.md` — catalog repo's concern
- `docs/contributing.md` — covered by CLAUDE.md
- `docs/commands.md` — redundant with cli.md
- `docs/dependencies.md`, `docs/validation.md`, `docs/generated-files.md`, `docs/updates.md`, `docs/memory.md` — covered by inline docs
- `docs/technical-guide.md`, `docs/detection-improvement-plan.md` — historical
- `docs/setup-guide.md`, `docs/global-install.md`, `docs/user-guide.md` — absorbed into README

**Keep and update** (strip plugin/catalog-repo references):
- `docs/architecture.md` — internal dev, system design
- `docs/cli.md` — internal dev, command reference
- `docs/security.md` — internal dev, guardrails

**README rewrite** (user-facing entry point):
1. What it is (one paragraph)
2. Installation
3. Usage (key commands)
4. General info / links to internal dev docs

No separate user-guide.md.

---

## 4. Inline Documentation

Add JSDoc and inline comments throughout `src/`.

**Module-level:** Top-of-file comment on every file — purpose and role in the system (1–3 lines).

**Function-level JSDoc** on all exported functions across:
- `src/commands/` — CLI handlers
- `src/scanner/` — project detection
- `src/recommender/` — scoring + explainability
- `src/catalog/` — catalog load/validate
- `src/security/` — guards + redaction
- `src/install/` — apply/uninstall
- `src/update/` — lockfile + hash refresh
- `src/claude/` — generated file writers
- `src/memory/` — memory store
- `src/utils/` — shared utilities

**Skip:** trivial one-liners, self-explanatory names where a comment would restate the name.

**Style:** `/** */` JSDoc for exported APIs, `//` inline for non-obvious logic. No multi-paragraph blocks.
