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
| D2  | Still present                           | `setup-project`/`scan` never reference `workspace discover`                                                                                                                          |
| D3  | Partially true                          | `.NET`/Java/Ruby markers genuinely missing; the report's PHP claim is false (`composer.json` has always been a marker)                                                               |
| D4  | Partially fixed                         | catalog recommendation already uses an inclusive role-set (fixed); `workspace discover`'s per-repo `role` label still picks `repoRoles[0]` (first-alphabetical, advisory field only) |
| D6  | Still present                           | workspace-root aggregate layer never surfaces sibling repos' `.claude/agents/`                                                                                                       |
| D8  | Reporter's retraction confirmed correct | `doctor` does surface `--include` warnings, indirectly via `recommendation.json`                                                                                                     |

## Phasing

Ordered by the priority the reporter and you agreed on (D1+D5 first, then D7), with one dependency inserted: **D9 must land with D1**, because D9 is what silently defeats D1's one existing safety net (a leaked sibling stack flips `detectionStatus` from `"unknown"` to `"supported"`, which deletes the warning D1 is supposed to strengthen). Shipping D1 without D9 ships a guard that doesn't actually guard the reporter's own scenario.

## Combined sequencing (with [workspace-worktree-materialization.md](workspace-worktree-materialization.md))

The two plans share dependencies — do not execute either in isolation without checking this order. Rationale: Task 1.2 below has a throwaway worktree-detection stand-in (`fs.lstatSync('.git')`) that the other plan's Task 1 (`resolveRoots()`) replaces properly — building Task 1.2 before that lands means reworking it later. The other plan also fixes an already-landed data-corruption incident (higher severity than this backlog).

- **Wave 1 (parallel):** other-plan Task 1 (`resolveRoots`) + other-plan Task 2 (untrack machine-local state) + this plan's Task 1.1 (D9 scanner boundary) — mutually independent.
- **Wave 2:** this plan's Task 1.2 (D1 zero-signal guard — rework to consume `resolveRoots()`/`isLinkedWorktree` instead of its own lstat check, depends on Wave 1's both halves) + other-plan Task 3 (`readMembers()`, depends on other-plan Task 1).
- **Wave 3:** this plan's Task 1.3 (D5 gitignore-awareness — sequence after other-plan Task 2's new gitignore-writer, same code area) + other-plan Task 4 (worktree command, depends on other-plan Task 1+3) + this plan's Task 3.4/3.5 (Task 3.4 depends on other-plan Task 3).
- **Last:** other-plan Task 5/6 + this plan's remaining Phase 2/3 tasks + all ADRs.

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

## Phase 2 — D7 (no-op)

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

### Task 3.4 — D6 (revised): cross-repo skill/agent/command visibility at the workspace root

**Superseded design note:** the original D6 design (index/manifest file only, no copy/symlink) is dropped. An index is inert JSON — it does not make a sibling repo's skill invocable via Claude Code's own Skill tool/discovery, so it doesn't actually close the gap. Revised per external ticket (vafab-workspace brainstorm, 2026-08-05): Claude Code's directory-scoped skill discovery appears to stop recursing at a nested `.git` boundary, so a member repo's `.claude/skills/`, `.claude/agents/`, `.claude/commands/` never surface when a session starts at the workspace root, even though the files are physically present under the tree.

**Do, in order:**

**3.4a — Verify the hypothesis before building anything.** Test three things, not one:

1. Symlink discovery: from workspace root's own `.claude/skills/`, symlink to a member repo's `.claude/skills/<name>`; fresh Claude Code session at workspace root; does it appear in the skill list?
2. Symlink + nested-`.git` re-check: same as (1), but confirm the target isn't excluded because its _resolved_ (realpath) location is still inside a nested `.git` tree — some discovery implementations resolve-then-boundary-check, which would silently defeat the symlink for the same root cause, one hop later.
3. Copy control: plain copy of the same skill directory into workspace root's `.claude/skills/` (no symlink, no nested `.git` anywhere in the path) — confirm this trivially works. This is the fallback if (1)/(2) fail, and should be built regardless as the safer default (see below).

**Do not build 3.4b onward until this is run and results recorded here.**

**3.4b — Default implementation: copy-with-provenance, not symlink.** New `haus workspace link-context` subcommand (or a phase inside `haus workspace setup`). For each already-haus-initialized member repo (has `.claude/skills|agents|commands`):

- Copy (not symlink) each skill/agent/command into `.claude/{skills,agents,commands}/<repo-folder>--<name>/` at the workspace root, prefixed to avoid collisions (multiple member repos commonly ship `security-review`, `writing-documentation`, etc.).
- Stamp each copy with provenance metadata (source repo, source relative path, content hash) — reuse the existing managed-file hash/tamper pattern (`checkManagedTamper`, already used for `WORKFLOW.md` staleness in `doctor.ts`) rather than inventing a new mechanism. Mark the copy clearly as "source of truth lives in `<repo>`, do not edit here."
- **Why copy over symlink, even if 3.4a's hypothesis clears:** matches this codebase's existing "never create/follow symlinks" security posture (ADR-0010; enforced in `scaffold.ts`, `write-claude-files.ts`, `backups.ts`), avoids Windows symlink-permission issues, and doesn't depend on an external tool's undocumented discovery behavior continuing to work across Claude Code versions. Only revisit symlinking if the team explicitly wants live-edit convenience over that safety margin — write it as an ADR either way (see 3.4e).
- Not committed — these are derived from local `repos.local.json` path overrides and which member repos are actually cloned. Add a `.gitignore` pattern (parallel to the existing `.claude/worktrees/` entry).
- Track linked/copied entries in a new `.haus-workflow/workspace.manifest.json` section, e.g. `linkedContext: [{ repo, type: 'skill'|'agent'|'command', name, path, sourceHash }]`, so `doctor`/`apply --write` know these are generated and don't double-manage or misreport them as drift.
- Run automatically as the last step of `haus workspace setup`; also expose standalone so it can re-run after `project:clone`/`project:cloneandsetup` without a full re-setup.
- Removal: if a member repo drops out of `haus.workspace.yaml` or is no longer cloned locally, remove its copied entries (scoped equivalent of `haus undo`).

**3.4c — `doctor` staleness check.** Extend `workspace/doctor.ts` (or `commands/doctor.ts` when run at a workspace root) to compare each `linkedContext` entry's stored `sourceHash` against the live source file in the member repo; flag `stale — re-run haus workspace link-context` the same way template staleness is reported today. A copied entry with a hash mismatch is staleness, not local tampering — don't route it through the same "modified locally" tamper flag used for catalog-managed files.

**3.4d — Edge cases (from ticket, carry into acceptance criteria):**

- Member repo not cloned locally yet → skip, log clearly, no error.
- Name collision surviving the repo-folder prefix (two repos with the same folder name) → fail loudly with a clear message; never silently overwrite.
- Member repo has a locally-edited (non-catalog) skill → copy it same as any other; the member repo remains the owner of the original.
- Windows symlink note is moot under copy-default, but document it in `docs/architecture.md` if symlink is ever revisited.

**3.4e — ADR required.** Per `WORKFLOW.md` → "Architecture Decision Records" (security model choice), write `docs/decisions/NNNN-workspace-cross-repo-context-copy-vs-symlink.md` before implementing 3.4b, documenting: the verified 3.4a results, why copy-with-provenance was chosen over symlink, and the staleness tradeoff accepted.

**Acceptance criteria (ticket-sourced):**

- Workspace with ≥2 haus-initialized member repos: after `haus workspace setup` (or standalone `link-context`) and a **new** Claude Code session at the workspace root, member repos' skills/agents appear in the skill list with no name collisions.
- `haus doctor` at the workspace root does not flag the copied entries as drift or "modified locally" — only as `stale` when the source has changed.
- Removing/unlinking a member repo cleans up its copied entries fully (no orphans).
- Generic — works against any multi-repo workspace (not hardcoded to vafab-workspace); test against at least one other workspace besides the one that surfaced the bug.

**Verification:** `yarn test` (fixture-based: 2 synthetic member repos with distinct skills, run `link-context`, assert copies + manifest section + collision-fail case); manual repro against `vafab-workspace` — real Claude Code session, confirm skill list.

**Dependencies:** 3.4a gates 3.4b-3.4e. Independent of Tasks 3.1-3.3 (different subsystem — `aggregate.ts`/new `link-context` vs `discover.ts`), can run in a separate worktree in parallel.

---

### Task 3.5 — new: `workspace`/`meta-repo` role so `doctor` stops flagging noise at workspace roots

**Do:** Add a `workspace` role to `src/scanner/detection-registry.ts`, detected via presence of `repos.manifest.json` and/or `haus.workspace.yaml` at the scan root (same signal `workspace/discover.ts` already uses). When this role is present, suppress or reword the generic "Stack not recognised" message from `src/recommender/policies.ts:66-67` and the "no framework / no `.env.example` / no test script" warnings in plain `commands/doctor.ts` — a workspace root legitimately has none of these. Also stop carrying forward a stale per-app role (e.g. `dotnet-service`) into a workspace root's own `context-map.json` if one was scanned before the meta-repo pattern existed.

**Acceptance criteria:** `haus doctor` run at a workspace root (has `repos.manifest.json`, no runnable stack of its own) reports something like `Roles: workspace` and does not emit "Stack not recognised" / missing-`.env.example` / missing-test-script warnings.

**Verification:** `yarn test` with a fixture workspace root; `yarn test` regression on existing non-workspace fixtures (role detection must not fire for a normal single-repo project).

**Dependencies:** none, independent of 3.4.

---

## Out of scope

- **D8** — reporter's own retraction confirmed correct (`doctor` does surface `--include` warnings via `recommendation.json`). No code change. Optional: document the ordering dependency (must run `recommend --include` before `doctor` will show it) in `docs/cli.md`, but not fix-worthy.
- **D7** — false claim, closing per Task 2.1 (test-only).
- **D10** — removed from this plan's scope per explicit decision (2026-08-05). Was: diff + backup before pruning haus-tracked permission rules on `update`. If picked up later, needs its own task write-up.
- Broader ajv/schema adoption, catalog-side changes — none of these findings touch the catalog repo.

## Suggested execution order & worktrees

Independent tasks (no shared state) → parallel subagents, each in its own worktree, per `WORKFLOW.md` → "Subagent patterns":

```bash
# Phase 1 — sequential within phase (1.1 blocks 1.2), 1.3 parallel to both
git worktree add .claude/worktrees/scanner-repo-boundary -b fix/d9-nested-repo-boundary   # Task 1.1
git worktree add .claude/worktrees/zero-signal-guard -b fix/d1-worktree-zero-signal-guard  # Task 1.2, after 1.1 merges
git worktree add .claude/worktrees/gitignore-awareness -b fix/d5-gitignore-awareness       # Task 1.3, parallel

# Phase 2
git worktree add .claude/worktrees/write-edit-regression -b test/d7-write-edit-pairing     # Task 2.1

# Phase 3 — fully parallel (independent modules)
git worktree add .claude/worktrees/workspace-cross-reference -b fix/d2-workspace-cross-reference  # Task 3.1
git worktree add .claude/worktrees/repo-markers -b fix/d3-repo-markers-dotnet-java-ruby            # Task 3.2
git worktree add .claude/worktrees/discover-role-fix -b fix/d4-discover-role-selection             # Task 3.3
git worktree add .claude/worktrees/cross-repo-context-verify -b spike/d6-symlink-hypothesis-verify   # Task 3.4a, do first, blocks 3.4b-e
git worktree add .claude/worktrees/cross-repo-context-link -b feat/d6-workspace-link-context          # Task 3.4b-3.4d, after 3.4a
git worktree add .claude/worktrees/workspace-role-detection -b fix/d6-workspace-meta-repo-role         # Task 3.5, parallel to 3.4
```

Each branch: `yarn verify` before opening a PR, per `CLAUDE.md` → "Before opening a PR". `fix:` commits need a regression test (CI `fix-needs-test` gate) — every task above already specifies one.

## Stop conditions

Per `WORKFLOW.md` → "Stop conditions": stop and ask if Task 1.2's `--force` gate design (warn-only vs hard-block) needs a product decision before the ADR is written, or if any fixture repro in Phase 1 can't be reproduced against current `main` (re-verify before building on a stale finding). Additionally: stop after Task 3.4a — do not proceed to 3.4b-3.4e until the symlink-discovery hypothesis (both the plain case and the nested-`.git` re-check case) is verified and recorded, since the entire mechanism design depends on that result.

## Revision log

- 2026-08-05: Task 3.4 (D6) rewritten per external ticket (vafab-workspace brainstorm) — index-only design dropped as insufficient (inert JSON doesn't make a skill Skill-tool-invocable); replaced with verify-first, copy-with-provenance-by-default design, plus new Task 3.5 for the workspace/meta-repo `doctor` role. Ticket confirmed factual against this repo's source: no cross-repo skill/agent/command aggregation exists anywhere in `src/` (only JSON summaries in `workspace/aggregate.ts`); `policies.ts:66-67`'s "Stack not recognised" message and the stale-role display in `doctor.ts:71` are exact matches for the reported noise; no `workspace`/`meta-repo` role exists in `detection-registry.ts`.
- 2026-08-05: separate ticket ("worktree-safe root + member materialization") landed as its own plan — [workspace-worktree-materialization.md](workspace-worktree-materialization.md). Two integration points with this plan: (1) that plan's Task 1 (`resolveRoots()`, worktree-vs-main-checkout detection) is complementary to this plan's Task 1.1/D9 (nested-`.git` boundary in the scanner) — same git-boundary-awareness theme, opposite directions (scanning into a sibling repo vs. running from inside a worktree); land independently but check for overlap. (2) that plan's Task 3 (`readMembers()`, unifying `haus.workspace.yaml`/`repos.manifest.json`) should be the single source Task 3.4's copy-with-provenance step uses for member-repo enumeration — don't build a second member-resolution path here. See "Combined sequencing" section above for the merged execution order across both plans.
- 2026-08-05: D10 (Task 2.2, diff+backup before pruning haus-tracked permission rules) removed from scope per explicit decision — see "Out of scope."
