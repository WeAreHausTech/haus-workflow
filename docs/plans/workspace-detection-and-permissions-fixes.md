# Workspace detection & permissions fixes — Implementation Plan

**Goal:** Fix the confirmed defects from the external bug report (originally filed against 1.2.0/catalog v3.6.0, re-tested against 1.3.0/v4.1.1) that still reproduce against current `main` @ `ca4552d` (v1.4.1). Root cause of the reporter's actual incident (`setup-project` in a git worktree with missing sibling repos → zero tech-stack agents installed, no warning) is D1, compounded by D9.

**Source:** user-supplied bug report (Slack docs, not independently fetchable — findings below are re-verified directly against this repo's source, not taken on the reporter's word). Investigated 2026-08-05 via 4 parallel `Explore` agents against `src/` (not `dist/`, which can be stale) plus live repro in scratch dirs.

**State verified:** 2026-08-05, against `main` @ `ca4552d` (v1.4.1).

## Verdict recap (do not re-litigate — re-verify only if `main` has moved)

| #   | Verdict                                 | One-line cause                                                                                                                                                                       |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Partially fixed                         | generic "stack not recognised" warning exists in `setup-project`, but is advisory-only, doesn't block the write, and is silent in bare `haus scan`                                   |
| D9  | Still present                           | nested `.git` boundary never enforced — sibling repo's stack signals leak into a meta-repo scan                                                                                      |
| D5  | Still present                           | zero `.gitignore` awareness anywhere in `src/`                                                                                                                                       |
| D7  | **False** — closing, no fix             | reporter's own evidence (`tools: ["Edit","Write"]`) disproves the claim; every `Write(...)` rule already has a paired `Edit(...)` rule                                               |
| D10 | Partially true                          | user-authored deny/ask rules are provably preserved (tested); but rules _haus itself_ previously tracked get silently pruned on `update` with no diff/backup                         |
| D2  | Still present                           | `setup-project`/`scan` never reference `workspace discover`                                                                                                                          |
| D3  | Partially true                          | `.NET`/Java/Ruby markers genuinely missing; the report's PHP claim is false (`composer.json` has always been a marker)                                                               |
| D4  | Partially fixed                         | catalog recommendation already uses an inclusive role-set (fixed); `workspace discover`'s per-repo `role` label still picks `repoRoles[0]` (first-alphabetical, advisory field only) |
| D6  | Still present                           | workspace-root aggregate layer never surfaces sibling repos' `.claude/agents/`                                                                                                       |
| D8  | Reporter's retraction confirmed correct | `doctor` does surface `--include` warnings, indirectly via `recommendation.json`                                                                                                     |

## Phasing

Ordered by the priority the reporter and you agreed on (D1+D5 first, then D7+D10), with one dependency inserted: **D9 must land with D1**, because D9 is what silently defeats D1's one existing safety net (a leaked sibling stack flips `detectionStatus` from `"unknown"` to `"supported"`, which deletes the warning D1 is supposed to strengthen). Shipping D1 without D9 ships a guard that doesn't actually guard the reporter's own scenario.

---

## Phase 1 — root cause (D9 + D1), then D5

### Task 1.1 — D9: enforce nested-repo boundary in the scanner

**Do:** In `src/utils/fs.ts` (`listFiles`, lines ~106-115), prune any subdirectory that contains its own `.git` (file or directory) _before_ applying `SAFE_FILES` glob matching in `src/scanner/scan-project.ts`. A nested `.git` marks a sibling repo's root — nothing under it should feed the parent scan.

- Add a directory-walk pre-pass (or a glob-ignore extension) that detects `**/.git` at any depth below the scan root (excluding the root's own `.git`) and excludes that entire subtree from `SAFE_FILES` matching and from `buildContentBlob` (`src/scanner/render.ts:17-39`).
- Apply the same boundary to `detection-registry.ts` file-presence checks (`fileEndsWith`, etc.) — they run over the same file list, so fixing `listFiles` should be sufficient; verify it actually is.

**Acceptance criteria:**

- Fixture: `meta/` (own `.git`, no manifest) containing `meta/sibling-repo/` (independent `.git`, `schema/sibling.graphql`). `haus scan --json` from `meta/` reports `detectedStacks: {}` and `detectionStatus: "unknown"` — not `"supported"` with a leaked `graphql` backend stack.
- Existing monorepo fixtures (single `.git` at root, multiple `package.json` below) are unaffected — nested `package.json` without its own `.git` still scans normally.

**Verification:** new test in `tests/scanner.test.js` (or wherever `scan-project` tests live) using the fixture above; `yarn test`.

**Dependencies:** none. **Risk:** medium — touches core file-walking; must not regress monorepo/nx/turbo detection (`crossRepoHints`, `scan-project.ts:106-114`) which _intentionally_ reads root-level `docker-compose.*`/`turbo.json`/`nx.json`.

---

### Task 1.2 — D1: explicit zero-signal / worktree guard

**Do:**

1. In `src/scanner/scan-project.ts`, after Task 1.1 lands, compute a `detectionStatus` as today but make the "unknown" case a **distinct, non-swallowable** warning rather than one that only surfaces through `setup-project`'s recommender layer. Surface it from `src/commands/scan.ts` too (currently silent — `haus scan` prints nothing when `detectionStatus === "unknown"`).
2. Add a worktree check: `fs.lstatSync(path.join(root, '.git'))` — if it's a file (not a directory), the root is a linked worktree; if sibling repos referenced by the workspace context aren't resolvable from there, include that fact explicitly in the warning text (distinguish "no stack detected" from "no stack detected — you're in a git worktree, sibling repos may not be on disk here").
3. Decide (see ADR note below) whether zero-signal should just warn loudly (current behavior, strengthened) or hard-block `recommendation.json`/`haus.lock.json` writes behind a `--force` flag. Recommend: **warn loudly by default, gate the write behind `--force` only when _zero_ catalog items matched at all** (not just zero stacks — stack-agnostic items should still install) to avoid breaking legitimate stack-agnostic-only projects.

**Acceptance criteria:**

- `haus scan` on a zero-signal fixture prints a `WARN:` line (today: nothing).
- `haus setup-project` on the same fixture, run from a linked worktree (`git worktree add`), names the worktree condition explicitly in the warning.
- `haus setup-project --force` still writes recommendation/lock as today when the user explicitly opts in with zero matches.

**Verification:** test with `git worktree add` against a real temp repo (reproduces the reporter's actual scenario); `yarn test`.

**Dependencies:** Task 1.1 (D9) must land first — otherwise this guard can't be tested reliably, since a leaked sibling stack would falsely satisfy "non-zero signal".

**⚠️ Decision-worthy:** whether to introduce a hard `--force` gate is a behavior/policy change to the recommender's default failure mode. Per `WORKFLOW.md` → "Architecture Decision Records": _"defining a... security model... If you would otherwise make an assumption: write an ADR instead."_ Write `docs/decisions/NNNN-zero-signal-setup-guard.md` before implementing the `--force` gate; the warning-only strengthening (item 1-2 above) doesn't need one.

---

### Task 1.3 — D5: `.gitignore` awareness for `.claude/` and `.haus-workflow/`

**Do:** Add a `git check-ignore` based check in two places:

- `src/commands/doctor.ts` — new check alongside the existing hooks/CLAUDE.md/lock checks (~lines 70-290): run `git check-ignore -q .claude .claude/skills .claude/agents .haus-workflow` in the target repo; warn if any come back ignored (exit code 0 from `check-ignore` = ignored).
- `src/commands/apply.ts` (or wherever `apply --write` finalizes) — same check, surfaced once at the end of a fresh install, since that's when it matters most (reporter's actual failure mode: 80 skills written, invisible).

**Acceptance criteria:**

- Target repo with `.claude/` gitignored: `haus doctor` prints `WARN: .claude/ is gitignored — installed skills/agents will not be visible to anything relying on git-tracked state`.
- Target repo following the documented pattern (this repo's own `.gitignore`: only `settings.json`/`settings.local.json`/`worktrees/` ignored) passes clean.

**Verification:** fixture repo with `.claude/` in `.gitignore`; `yarn test`; manual `haus doctor` run against it.

**Dependencies:** none, can run in parallel with 1.1/1.2.

---

## Phase 2 — D7 (no-op) + D10

### Task 2.1 — D7: close as invalid, add regression test only

**Do:** No production code change — the claim is false (`ASK_PATHS`/`DENY_PATHS` already pair every `Write(...)` with `Edit(...)`, confirmed at `src/security/sensitive-paths.ts:57-67`). Add a unit test asserting the invariant so it can't regress silently:

```ts
// tests/ask-rules.test.js / deny-rules.test.js
it('never emits Write(pattern) without a matching Edit(pattern), or vice versa', () => {
  const askRules = buildAskRules()
  const denyRules = buildDenyRules()
  for (const rules of [askRules, denyRules]) {
    const writes = rules.filter((r) => r.startsWith('Write(')).map((r) => r.slice(6))
    const edits = new Set(rules.filter((r) => r.startsWith('Edit(')).map((r) => r.slice(5)))
    for (const w of writes) expect(edits.has(w)).toBe(true)
  }
})
```

**Acceptance criteria:** test passes today (proves the invariant already holds) and would fail if a future change to `ASK_PATHS`/`DENY_PATHS` broke the pairing.

**Verification:** `yarn test`.

**Dependencies:** none. **Risk:** none — test-only, no behavior change.

---

### Task 2.2 — D10: diff + backup before pruning haus-tracked permission rules

**Do:** In `src/install/settings-merge.ts` (`reconcileManagedRules`, lines ~223-254), when a rule present in `_haus.denyRules`/`_haus.askRules` from a prior run is _not_ in the new build list (i.e., it's about to be pruned):

1. Log an explicit line per pruned rule: `"deny: removed Read(.env) (no longer haus-managed as of vX.Y.Z)"` — via the same output channel `update.ts:110`/`135` already use.
2. Back up the pre-update `.claude/settings.json` before writing, the same way `applyLock()` backs up `haus.lock.json` (`.haus-workflow/backups/`) — currently `writeProjectSettings()` (`src/claude/merge-project-settings.ts:80-82`) writes via plain `writeJson`, bypassing the managed-file backup path (`writeManagedJson`) that `WORKFLOW.md`/`CLAUDE.md` already use.

**Acceptance criteria:**

- Fixture: settings.json with `_haus.denyRules` containing `Read(.env)`, current `buildDenyRules()` no longer includes it → `update` run prints the removal line and a pre-update backup of `settings.json` exists in `.haus-workflow/backups/`.
- User-authored rules (never in `_haus.*` ledger) remain untouched and unlogged (already covered by existing `tests/deny-rules.test.js:62-68` — don't regress it).

**Verification:** extend `tests/deny-rules.test.js` with the pruning-with-backup case; `yarn test`.

**Dependencies:** none, independent of Phase 1.

**⚠️ Decision-worthy (optional):** if this pattern (silent-prune-of-previously-managed-rules) is judged a broader trust issue, consider an ADR on "managed settings.json change visibility" — logging alone (this task) may be sufficient without one; use judgment, don't force an ADR for a logging-only fix.

---

## Phase 3 — remaining confirmed defects

### Task 3.1 — D2: cross-reference `workspace discover` from `setup-project`/`scan`

**Do:** In `scanProject`/`setup-core`, reuse `discoverRepos`'s marker logic (`src/commands/workspace/discover.ts`) to check: does the current root have ≥2 sibling directories that look like independent repo roots? If so, push a warning suggesting `haus workspace discover` instead of (or in addition to) per-repo `setup-project`.

**Acceptance criteria:** running `setup-project` inside a directory with 2+ sibling `.git` roots prints `WARN: multiple sibling repos detected — consider "haus workspace discover"`.

**Verification:** fixture with 2 sibling repos; `yarn test`.

**Dependencies:** none (can reuse, not depend on, Task 1.1's boundary logic).

---

### Task 3.2 — D3: extend `REPO_MARKERS` for missing stacks

**Do:** In `src/commands/workspace/discover.ts:42`, extend:

```ts
const REPO_MARKERS = [
  '**/.git',
  '**/package.json',
  '**/composer.json',
  '**/*.csproj',
  '**/*.sln',
  '**/*.fsproj', // .NET
  '**/pom.xml',
  '**/build.gradle*', // Java
  '**/Gemfile', // Ruby
]
```

**Acceptance criteria:** new regression test fixture with 5 sibling repos (JS, PHP, .NET, Java, Ruby) — `discoverRepos` finds all 5, none dropped by the `isDescendant` sub-package collapsing logic.

**Verification:** `yarn test`.

**Dependencies:** none.

---

### Task 3.3 — D4: fix `workspace discover`'s per-repo role selection

**Do:** In `src/commands/workspace/discover.ts:110-113`, replace `if (scan.repoRoles[0]) role = scan.repoRoles[0]` (first-alphabetical) with either: (a) store the full `repoRoles` array in `haus.workspace.yaml` instead of a single string, or (b) if the field must stay single-valued, prefer a `*-app`/`*-service` fullstack marker over a bare frontend/backend split when both are present, and document that the field is advisory/display-only.

**Acceptance criteria:** fixture repo with both `express-service` and `react-app` signals — `haus.workspace.yaml` role field reflects the mixed nature (either both roles listed, or an explicit fullstack marker), not silently `express-service` because "e" < "r".

**Verification:** `yarn test`; confirm `workspace setup`'s per-repo `runSetupCore` call is unaffected (it already re-scans with the full role-set — this task shouldn't touch that path, only the display/manifest field).

**Dependencies:** none.

---

### Task 3.4 — D6: aggregate per-repo `.claude/agents/` at the workspace root

**Do:** Extend `writeWorkspaceArtifacts` (`src/commands/workspace/aggregate.ts`) to walk each member repo's `.claude/agents/` (and optionally `commands/`, `skills/`) and emit an index/manifest at the workspace root (`.haus-workflow/workspace-agents-index.json` or similar) that `write-workspace-claude-md.ts`'s import block can reference, so agents scoped to a sibling repo remain discoverable when Claude Code is invoked from the meta-repo root. Prefer an index file over copying/symlinking agent files themselves (avoids drift between the copy and the source-of-truth per-repo file).

**Acceptance criteria:** workspace with 2 member repos, each with distinct `.claude/agents/*.md` — after `haus workspace setup`, the workspace-root `CLAUDE.md` import block references both sets, and a generated index lists agent name → owning repo path.

**Verification:** `yarn test`; manual `haus workspace setup` against a 2-repo fixture, inspect generated `CLAUDE.md`.

**Dependencies:** none, but logically follows Task 3.1-3.3 (same `workspace` command family) — fine to parallelize across separate branches/worktrees since no shared state.

---

## Out of scope

- **D8** — reporter's own retraction confirmed correct (`doctor` does surface `--include` warnings via `recommendation.json`). No code change. Optional: document the ordering dependency (must run `recommend --include` before `doctor` will show it) in `docs/cli.md`, but not fix-worthy.
- **D7** — false claim, closing per Task 2.1 (test-only).
- Broader ajv/schema adoption, catalog-side changes — none of these findings touch the catalog repo.

## Suggested execution order & worktrees

Independent tasks (no shared state) → parallel subagents, each in its own worktree, per `WORKFLOW.md` → "Subagent patterns":

```bash
# Phase 1 — sequential within phase (1.1 blocks 1.2), 1.3 parallel to both
git worktree add .claude/worktrees/scanner-repo-boundary -b fix/d9-nested-repo-boundary   # Task 1.1
git worktree add .claude/worktrees/zero-signal-guard -b fix/d1-worktree-zero-signal-guard  # Task 1.2, after 1.1 merges
git worktree add .claude/worktrees/gitignore-awareness -b fix/d5-gitignore-awareness       # Task 1.3, parallel

# Phase 2 — fully parallel
git worktree add .claude/worktrees/write-edit-regression -b test/d7-write-edit-pairing     # Task 2.1
git worktree add .claude/worktrees/settings-prune-diff -b fix/d10-settings-prune-diff      # Task 2.2

# Phase 3 — fully parallel (independent modules)
git worktree add .claude/worktrees/workspace-cross-reference -b fix/d2-workspace-cross-reference  # Task 3.1
git worktree add .claude/worktrees/repo-markers -b fix/d3-repo-markers-dotnet-java-ruby            # Task 3.2
git worktree add .claude/worktrees/discover-role-fix -b fix/d4-discover-role-selection             # Task 3.3
git worktree add .claude/worktrees/workspace-agents-aggregate -b fix/d6-workspace-agents-aggregate # Task 3.4
```

Each branch: `yarn verify` before opening a PR, per `CLAUDE.md` → "Before opening a PR". `fix:` commits need a regression test (CI `fix-needs-test` gate) — every task above already specifies one.

## Stop conditions

Per `WORKFLOW.md` → "Stop conditions": stop and ask if Task 1.2's `--force` gate design (warn-only vs hard-block) needs a product decision before the ADR is written, or if any fixture repro in Phase 1 can't be reproduced against current `main` (re-verify before building on a stale finding).
