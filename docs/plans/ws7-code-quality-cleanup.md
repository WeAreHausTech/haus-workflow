# WS7 — Code-quality cleanup (final workstream)

> Source: `docs/plans/system-audit-remediation.md` Part B WS7 + §Dev/code. One branch → one PR (CLI only). **Behavior-preserving** — covered by the richer suite built in WS1–WS10.
> **Checkpoint before starting** (largest diff, lowest behavioral risk). Do last.

## Goal

Smaller files, consistent names, no dead code — zero behavior change. `yarn verify` green is the contract; every split is mechanical (move symbols, fix imports, keep public API via re-export).

## Tasks

### T1 — Delete dead code

- `src/recommender/score-catalog-item.ts` (`scoreCatalogItem()`) — **no runtime caller** (only a stale type-comment reference). Delete.
- `src/recommender/types.ts` — exports only `RecommendationScore`, used solely by the deleted file. Verify no other importer, then delete the file (and the stale comment).
  **Acceptance:** files gone, `yarn verify` green. **Verify:** `grep -r scoreCatalogItem\\|RecommendationScore src tests` returns nothing after.

### T2 — Split `recommend.ts` (540 → orchestrator + 3 modules)

Move (behavior-identical, fix imports):

- **`recommender/ecosystem.ts`** ← `ECOSYSTEM_GROUPS`, `ECOSYSTEM_PRIMARY_BACKENDS`, `ECOSYSTEM_COMPATIBLE_BACKENDS`, `inferRepoEcosystems()`, `pickDominantBackend()`, `isBackendEcosystem()`.
- **`recommender/policies.ts`** ← `UNSUPPORTED`, `matchRequiresAny()`, `describeRequiresAny()`, `mergeRecommendationWarnings()` (imports ecosystem).
- **`recommender/scoring.ts`** ← `computeConfidenceLevel()`, `confidenceLevelToNumber()`, `readChangedFiles()`, `ReasonHit`/`SkipHit` types.
- **`recommend.ts`** keeps `recommend()` entry + `buildStackSet()`; imports the three. Clean DAG (ecosystem ← policies; scoring isolated). Importers (`commands/recommend.ts`, `commands/setup-project.ts`) unchanged — they import `recommend()`.
- **Rename** `blob` → `itemSearchText` (lines ~103/104/287).
  **Acceptance:** behavior identical; recommend.ts notably smaller. **Verify:** recommend + detection + task-intent suites + `yarn verify`.

### T3 — Split `scan-project.ts` (326 → orchestrator + detection + render)

- **`scanner/detection.ts`** ← `WEAK_STACK_SIGNALS`, `UNSUPPORTED_MARKERS`, `computeDetectionStatus()`, `finalizeRoles()`, `blocked()`, `dependencySet()` (imports `runDetection` from registry).
- **`scanner/render.ts`** ← `renderSummary()`, `computeConfidence()`, `buildContentBlob()` (already uses `describeRepo`).
- **`scan-project.ts`** keeps `scanProject()` + `SAFE_FILES`; imports both. Importers (scan/workspace/refresh/setup-project/read-context + 2 tests) call `scanProject()` — unchanged.
- **Rename** the `out` set in `dependencySet()` (line ~224) → `depNames` (plan's `out→detectedStacks` was **wrong** — it's a dep collector, not stacks).
  **Acceptance:** behavior identical; golden characterization test still byte-matches. **Verify:** detection-characterization + detection-status + `yarn verify`.

### T4 — Split `task-intent.ts` (395 → classification + rule-selection)

- **`recommender/task-classification.ts`** ← `TaskIntent` type, `ALL_INTENTS`, `TASK_INTENT_KEYWORDS`, `normalizeTaskForMatching()`, `classifyTaskIntents()`, `computeRuleIntents()`.
- **`recommender/rule-selection.ts`** ← `pickTaskRelevantRules()`, `selectRules()`, `applyTokenBudget()`, `DEFAULT_CONTEXT_TOKEN_BUDGET` (imports classification).
- **`task-intent.ts`** becomes a thin **re-export barrel** of the public API (`classifyTaskIntents`, `pickTaskRelevantRules`, `DEFAULT_CONTEXT_TOKEN_BUDGET`, `computeRuleIntents`, `TaskIntent`) so `commands/context.ts`, `explain-formatters.ts`, and both tests keep their current import path.
  **Acceptance:** behavior identical, import paths unchanged. **Verify:** task-intent + task-intent-budget tests + `yarn verify`.

### T5 — WS9 fold: frontmatter-integrity guard

- New `tests/frontmatter-integrity.test.js`: assert no haus write path emits content before the YAML `---` in `.claude/skills/*/SKILL.md` or `.claude/agents/*.md` (a regression there silently de-registers the skill/agent). Run `apply` into a temp repo (or inspect `write-claude-files` output) and assert any generated skill/agent file starts with `---` on line 1.
  **Acceptance:** test green; would fail if a future change prepends a header. **Verify:** `yarn test`.

## Verification gate

`yarn verify` after EACH task (catch a bad move immediately). The refactor's safety net is the existing suite (~176 tests). Adversarial fresh-context review before commit; address Copilot; `Co-Authored-By: Claude Opus 4.8`.

## Out of scope

No behavior change. No new features. WS9's optional `_haus`→sidecar move stays a low-priority tail item (not WS7).

## Order

T1 (delete) → T2 → T3 → T4 (independent splits, verify between each) → T5 (test). Renames done within their file's split task.
