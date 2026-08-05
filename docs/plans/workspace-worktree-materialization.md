# Worktree-safe workspace root + member-repo materialization — Implementation Plan

**Goal:** Fix two compounding defects in multi-repo "workspace-repo" setups (meta-repo + gitignored sibling app-repo clones), analyzed against `vafab-workspace` (5 member repos) running haus v1.4.1:

- **A.** haus has no concept of a git worktree — every command roots on `process.cwd()`, so running `haus` inside a Claude-Code-created worktree scans an empty shell (member repos never got checked out there) and writes that emptiness back as truth.
- **B.** `git worktree add` only checks out tracked files. Member repos are gitignored siblings, so a worktree never gets them — same for `repos.local.json`, `docker-compose.local.yml`, `.claude/settings.local.json`.

**Consequence already landed on `main` in vafab-workspace:** a `context-map.json` committed with an absolute path to a since-deleted worktree (`/Users/tim/Development/vafab-workspace/.claude/worktrees/haus-workflow-update-5c3bac`), empty `repoRoles`/`detectedStacks`, `repoName` derived from the worktree slug. This is why `haus doctor` today reports `Repo: haus-workflow-update-5c3bac`, `Roles: unknown`, `Stack not recognised` — describing a dead worktree, not the repo.

**Source:** external ticket ("haus: worktree-säker rot + materialisering av member-repon"), analyzed 2026-08-05 against `vafab-workspace`, v1.4.1. Codebase facts re-verified directly against this repo's `src/` (not taken on the ticket's word) via 3 parallel `Explore` agents, 2026-08-05.

**Relationship to [workspace-detection-and-permissions-fixes.md](workspace-detection-and-permissions-fixes.md):** separate plan (own feature, own decision set, ~3-5 days), but shares two integration points — flagged inline below. Do not duplicate work across the two plans.

## Verdict recap on the ticket's codebase claims (re-verified 2026-08-05, do not re-litigate unless `main` has moved)

| Claim                                                                                                                                       | Verdict                                        | Note                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root = process.cwd()` in every command, no root lookup anywhere in `src/utils/paths.ts`                                                    | Confirmed                                      | 11+ commands, `undo.ts:161`, `backups.ts:405`                                                                                                                                                                                                                        |
| `--git-common-dir` used zero times                                                                                                          | Confirmed in `src/`                            | 7 hits exist in `.claude/skills/*.md` shell snippets (docs, not code) — ticket said "repo-wide," minor overstatement                                                                                                                                                 |
| Only `resolveWorkspaceRoot`/`packageRoot` walk up, neither checks a git boundary                                                            | Confirmed                                      | `workspace/setup.ts:68-76`, `utils/paths.ts:46-64`                                                                                                                                                                                                                   |
| `repoName` falls back to worktree slug                                                                                                      | Confirmed                                      | `scan-project.ts:124`                                                                                                                                                                                                                                                |
| Zero worktree-detection code anywhere in `src/`                                                                                             | Confirmed                                      | net-new work, no partial implementation to reconcile with                                                                                                                                                                                                            |
| Three-file config trap (`haus.workspace.yaml` code-read; `repos.manifest.json`/`repos.local.json`/`localdev.yml` skill-doc vocabulary only) | Confirmed                                      | see Task 3                                                                                                                                                                                                                                                           |
| `relationships` parsed but never interpreted                                                                                                | Confirmed                                      | pure passthrough blob                                                                                                                                                                                                                                                |
| `renderWorkspaceYaml` drops unknown top-level keys                                                                                          | Confirmed                                      | drops even earlier, at `parseWorkspaceConfig` (parse time, not just render time) — matters for Task 3 schema additions                                                                                                                                               |
| Hooks 3-list parity, gate enum, retired-hooks list, hook-io exit-0 contract, two managed-file mechanisms, managed-paths registration        | All confirmed                                  | matches ticket's codebase-facts section closely                                                                                                                                                                                                                      |
| haus writes a `.gitignore` template that Task 2 just needs entries added to                                                                 | **False**                                      | no `.gitignore`-writing code exists anywhere in haus today — Task 2 must build this capability, not extend it                                                                                                                                                        |
| `deep-context.json` is one of the 5 CLI-written artifacts needing the absolute-path fix                                                     | **Partially false**                            | written by the `writing-documentation` **skill** (LLM-authored), not haus CLI code — fix needs a catalog-side skill-instruction change too, not just a CLI patch                                                                                                     |
| `setup-answers.json` is a 6th machine-local artifact needing untracking                                                                     | **Unverified/likely stale**                    | zero references anywhere in current `src/`/`library/`/docs — no reader, no writer. Confirm with Tim/against vafab-workspace directly what actually writes this before scoping its migration; don't build handling for a file this CLI version has no relationship to |
| `context-map.json`'s `root` field is an absolute path                                                                                       | Confirmed                                      | `types.ts:15-17`, serialized verbatim every scan                                                                                                                                                                                                                     |
| `docs/architecture.md:33`'s "commands never import each other"                                                                              | Confirmed documented, but **already violated** | `init.ts` imports `setup-project.ts` — pre-existing, unrelated to this ticket, no action needed here                                                                                                                                                                 |

## Decisions locked in

| Question                 | Decision                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                    | Both defects, upstream in haus, so `haus update` fixes it for every project                                                                                                                                                                                                                                                      |
| Member-repo isolation    | Real isolation — one `git worktree` per member repo, not symlinks                                                                                                                                                                                                                                                                |
| Branch                   | Mirrors the workspace branch; created from the member's default branch if absent                                                                                                                                                                                                                                                 |
| Hydration                | Copy-on-write clone of `node_modules` etc., then install-reconciliation against the branch's own lockfile                                                                                                                                                                                                                        |
| Trigger                  | `haus workspace worktree add` as the correct path; `SessionStart` hook as the safety net                                                                                                                                                                                                                                         |
| **Task 3 config source** | **Bridge now**: teach the CLI to also read `repos.manifest.json` via a shared `readMembers()`. No migration for existing workspaces. The 3-file trap stays as a documented known wart; consolidation to one file is deferred to its own future ADR. (Decided 2026-08-05, superseding the ticket's "open, needs Aniisa" framing.) |

## Combined sequencing (with [workspace-detection-and-permissions-fixes.md](workspace-detection-and-permissions-fixes.md))

This plan's Task 1 and Task 2 come **first**, ahead of most of the other plan's tasks — decided 2026-08-05. Rationale: the other plan's Task 1.2 has a throwaway worktree-detection stand-in (`fs.lstatSync('.git')`) that this plan's `resolveRoots()` replaces properly — sequencing the other plan first would mean reworking that check once this lands. This plan also fixes an already-landed data-corruption incident (poisoned `context-map.json` committed to vafab-workspace `main`), higher severity than the other plan's bug-report backlog.

- **Wave 1 (parallel):** this plan's Task 1 (`resolveRoots`) + this plan's Task 2 (untrack machine-local state) + other-plan Task 1.1 (D9 scanner boundary) — mutually independent.
- **Wave 2:** other-plan Task 1.2 (D1 zero-signal guard — reworked to consume this plan's `resolveRoots()`/`isLinkedWorktree`, depends on Wave 1's both halves) + this plan's Task 3 (`readMembers()`, depends on this plan's Task 1).
- **Wave 3:** other-plan Task 1.3 (D5 gitignore-awareness — sequence after this plan's Task 2 gitignore-writer, same code area) + this plan's Task 4 (worktree command, depends on Task 1+3) + other-plan Task 3.4/3.5 (Task 3.4 depends on this plan's Task 3).
- **Last:** this plan's Task 5/6 + other-plan's remaining Phase 2/3 tasks + all ADRs from both plans.

---

## Task 1 — Worktree-safe root resolution

**Source:** Defect A. **Depends on:** none. Parallelizable with Task 2.

**Cross-link:** complements (does not duplicate) [workspace-detection-and-permissions-fixes.md](workspace-detection-and-permissions-fixes.md) Task 1.1 (D9). D9 fixes scanning **into** a nested sibling repo (leaking its stack signals inward via `listFiles`). This task fixes running **from inside** a worktree and not knowing it (rooting outward incorrectly). Both are git-boundary-awareness fixes but for opposite directions — land independently, no shared code path expected, but a reviewer should check for accidental overlap in whichever lands second.

**Build:** new module `src/utils/git-root.ts`:

```ts
export type RootInfo = {
  cwd: string
  repoRoot: string // git rev-parse --show-toplevel
  gitDir: string // absolute
  gitCommonDir: string // absolute
  isLinkedWorktree: boolean // gitDir !== gitCommonDir
  mainRoot: string // repoRoot if not linked, else dirname(gitCommonDir)
  worktreeName: string | null // basename(gitDir) when linked
  isGitRepo: boolean
}

export function resolveRoots(start?: string): RootInfo
```

**Details easy to miss:**

1. `git rev-parse --git-common-dir` can return a relative path (often just `.git`). Use `--path-format=absolute` (git ≥ 2.31), with a fallback that resolves against `--show-toplevel` for older git. Never assume absolute.
2. In the main checkout, `--git-dir` and `--git-common-dir` are identical. In a linked worktree, `--git-dir` = `<main>/.git/worktrees/<name>`, `--git-common-dir` = `<main>/.git`. This is the only reliable detection.
3. Submodules: `gitDir` lives under `<parent>/.git/modules/<name>` — `dirname(gitCommonDir)` is wrong there. Guard by requiring `path.basename(gitCommonDir) === '.git'` before deriving `mainRoot`; otherwise set `mainRoot = repoRoot`.
4. Bare repos / not-a-git-repo: set everything to `cwd`, `isGitRepo: false`, let callers fall back to today's behavior. Never throw.
5. Run git via the existing `runGit` helper, not a shell string.

**Where to use it — do not reflexively replace every `process.cwd()`:**

1. Tracked managed content (`CLAUDE.md`, `.haus-workflow/WORKFLOW.md`, `.claude/`, `docs/decisions/`, `haus.lock.json`) → stays on `repoRoot`. A worktree edit of repo content is legitimate and should happen in the worktree.
2. Member-repo lookup → `mainRoot` when no member worktrees exist, else the worktree's own (see Task 4).
3. `repoName` in `scan-project.ts:124` → derive from `mainRoot`, never a worktree slug.

**Acceptance criteria:**

1. `resolveRoots()` gives correct `mainRoot`/`isLinkedWorktree` in: main checkout, linked worktree, worktree with a `--path-format`-incapable git, submodule, bare repo, non-git directory.
2. `haus doctor` run in a linked worktree reports the repo's real name, not the worktree slug.
3. No existing test suite breaks.

**Verification:**

```bash
npm test -- git-root
cd /tmp && rm -rf rt && git init rt && cd rt && git commit --allow-empty -m init
git worktree add wt -b feat/x && cd wt && haus doctor
```

Doctor should report `rt`, not `wt`.

---

## Task 2 — Stop tracking machine-local state

**Source:** the vafab-workspace `main`-branch contamination. **Depends on:** none. Parallelizable with Task 1. **Requires ADR:** yes — breaking change for existing workspaces.

**Scope correction from re-verification:** haus has **no** `.gitignore`-writing code at all today (grep confirmed zero matches). This task is "build gitignore-writing capability, then use it," not "add 5 lines to an existing template."

**The problem:** these are written by haus and tracked in consumer repos today: `context-map.json`, `recommendation.json` (56 KB in vafab-workspace), `sources-report.json`. They carry machine-local absolute paths and machine-specific scan output. They should never have been in git. `haus.lock.json` is a different case — it's a registry of what haus installed into the repo's own tracked content, so it correctly stays tracked at `repoRoot`.

**`deep-context.json` — separate track, not a CLI fix:** written by the `writing-documentation` skill (LLM-authored at runtime), not by haus CLI code. Gitignoring it is CLI-side (gitignore doesn't care who writes a file), but "stop embedding absolute paths in it" requires editing the skill's instructions in the **catalog** repo (`haus-workflow-catalog`), not this repo. Scope this as a linked but separate sub-task; don't block this plan's CLI-side work on a catalog PR, but track it (issue or follow-up ADR note) so it doesn't get dropped.

**`setup-answers.json` — do not build migration logic yet.** Zero references anywhere in current `src/`/`library/`. Before including it: confirm directly against vafab-workspace (or with whoever filed the ticket) what actually writes this file there — it may be a leftover from a haus version predating this codebase's current artifact set. Building untracking/migration for a file this CLI has no writer for risks either dead code or, worse, guessing wrong about its schema.

**Build:**

1. New gitignore-writer (e.g. `src/claude/write-gitignore.ts`) that ensures haus's own artifact patterns are present in the project's `.gitignore`, additive/idempotent (don't clobber user entries), covering at minimum: `context-map.json`, `recommendation.json`, `sources-report.json`, `deep-context.json` (path-only entry; content fix is the separate catalog track above). Confirm whether `setup-answers.json` belongs here per the note above before adding it.
2. `haus apply --write` detects any of these are currently tracked and runs `git rm --cached` on them, with a clear, non-silent explanatory message.
3. Stop serializing absolute paths into these artifacts going forward. `context-map.json`'s `root` field (`types.ts:15-17`, confirmed absolute) should either be dropped or stored repo-relative. Defense in depth: even if a file leaks into git again, it shouldn't carry `/Users/<name>/...`.
4. `haus doctor` flags any still-tracked artifact with the exact fix command.

**Acceptance criteria:**

1. A freshly-initialized project never tracks these artifacts.
2. An existing project with them tracked gets migrated by `haus apply --write`, with a clear explanation of what happened and why.
3. No generated artifact contains an absolute path.
4. Migration is idempotent — doesn't error when the files are already untracked.
5. `haus undo` is not negatively affected.

**Verification:**

```bash
grep -rE '"/(Users|home)/' .haus-workflow/*.json   # zero hits
git ls-files .haus-workflow/ | grep -E 'context-map|recommendation|sources-report'  # empty
```

---

## Task 3 — Make the member list readable by the CLI

**Depends on:** Task 1. **Requires ADR:** yes, documenting the bridge-now decision (locked above) and why consolidation was deferred.

**The decision (locked):** bridge now — teach the CLI to read `repos.manifest.json` in addition to `haus.workspace.yaml`, rather than consolidating to a single file. No migration needed for existing workspaces; the 3-file trap remains a documented known wart. Write the ADR anyway, noting the alternative (consolidate now) and why it was deferred (bigger change, needs a migration path, no urgency yet).

**Build:** a shared read layer, `src/workspace/members.ts`, returning a normalized list regardless of source:

```ts
export type Member = {
  id: string
  folder: string // relative to workspace root
  url?: string
  absPath: string // resolved against mainRoot or a pathOverride
  source: 'haus.workspace.yaml' | 'repos.manifest.json'
}
export function readMembers(rootInfo: RootInfo): Member[]
```

Honor `repos.local.json`'s `pathOverrides` if present — existing workspaces rely on it.

**Cross-link (important, avoid duplicated work):** [workspace-detection-and-permissions-fixes.md](workspace-detection-and-permissions-fixes.md) Task 3.4 (cross-repo skill/agent/command copy-with-provenance) needs to enumerate member repos too. That task should **consume this `readMembers()`**, not roll its own member-repo resolution. If Task 3.4 lands first, its member-enumeration should be refactored to call `readMembers()` once this task ships; if this task lands first, Task 3.4 should be written against it directly. Flag this dependency to whoever picks up either task.

**Details:**

1. `renderWorkspaceYaml` (`discover.ts:162-168`) rebuilds the object from scratch and silently drops unknown keys — confirmed this also happens earlier, at parse time (`parseWorkspaceConfig`). Adding fields to `haus.workspace.yaml` requires updating both the parser and the renderer, or they're silently deleted on the next `discover --write`.
2. Tolerant on read, strict on write. A broken manifest should produce a clear error, not an empty list that lets downstream logic silently assume the workspace has no members.

**Acceptance criteria:**

1. `readMembers()` works against vafab-workspace with no file added there.
2. `pathOverrides` is honored.
3. Broken config produces a clear error, never a silent empty list.
4. New keys survive a `discover --write` round-trip.

---

## Task 4 — `haus workspace worktree`

**Depends on:** Task 1, Task 3. This is the core — largest and hardest piece.

**Command surface:**

```
haus workspace worktree add <slug> [--branch <name>] [--only <repo,repo>] [--no-hydrate] [--dry-run]
haus workspace worktree hydrate [--only <repo>] [--force] [--dry-run]
haus workspace worktree list
haus workspace worktree remove <slug> [--force] [--dry-run]
haus workspace worktree doctor [--from-hook]
```

Follow the architecture rule: thin handler in `src/commands/workspace/worktree.ts`, logic in `src/workspace/worktree/`.

### `add <slug>`

1. `resolveRoots()`. Require the command to run from (or resolve up to) the workspace root.
2. `readMembers()`.
3. `git -C <mainRoot> worktree add <mainRoot>/.claude/worktrees/<slug> -b <branch>`. Branch defaults to the slug (configurable pattern). If the branch already exists, check it out instead of creating.
4. Per member: `git -C <member.absPath> worktree add <wsWorktree>/<member.folder> -b <branch>`.
   - If the branch exists in the member repo, check it out.
   - Otherwise create it from the member's default branch: read `refs/remotes/origin/HEAD` via `git symbolic-ref`, fall back to local `main` then `master`. **Never fetch over the network** — member repos live on different hosts (Azure DevOps, GitHub) with different auth, and `worktree add` is otherwise a fully local operation. If the reference is missing, warn and use the local default.
5. Hydrate, unless `--no-hydrate`.
6. CoW-copy machine-local files that exist and aren't tracked: `docker-compose.local.yml`, `.claude/settings.local.json`.
7. Report a per-member summary: branch, hydration strategy, time taken.

### Hydration — two steps, in order

**Step 1, CoW clone.** Copy hydration targets from `<mainRoot>/<folder>/<target>` to `<worktree>/<folder>/<target>`.

- macOS/APFS: `cp -c -R`
- Linux btrfs/XFS: `cp -a --reflink=auto -R`
- ext4 and others: `--reflink=auto` silently falls back to a full copy. Detect this and skip CoW entirely there — go straight to step 2. A silent 310 MB copy is worse than an install.
- If the copy fails, log and continue to step 2. Never fatal.

**Why copy-on-write, with the numbers:** all source code across the 5 vafab-workspace member repos is 17 MB combined. The real cost is `node_modules`/`obj`/`bin`. `git worktree` already shares the object store (checkouts are nearly free); on APFS, `cp -c` makes a copy-on-write clone. Measured on vafab-forms: 310 MB `node_modules` copied in **2.9s**, actual disk delta **5 MB**. The filesystem shares blocks until something writes — a genuinely independent copy semantically (writes don't leak back, unlike hardlinks), making real isolation practical instead of theoretical. Caveat: APFS-specific; Linux needs `--reflink=auto` on btrfs/XFS, ext4 gets a real copy — hence the fallback above.

**Step 2, install-reconciliation against the branch's own lockfile:**

| Lockfile                       | Command                          | Warning                                                                            |
| ------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------- |
| `yarn.lock` + `packageManager` | `corepack yarn install`          | Avoid `--immutable` — the branch may legitimately have a different lockfile        |
| `pnpm-lock.yaml`               | `pnpm install --frozen-lockfile` |                                                                                    |
| `package-lock.json`            | `npm install`                    | **Not `npm ci`.** `npm ci` deletes `node_modules`, defeating the CoW step entirely |
| `composer.lock`                | `composer install`               |                                                                                    |
| `.csproj` / `.sln`             | `dotnet restore`                 | Uses the global `~/.nuget` cache — cheap                                           |

Members are independent — run them in parallel.

### `remove <slug>`

1. Find every member worktree under the slug.
2. Refuse by default when there's uncommitted or unpushed work — list exactly what was found and in which repo. Only `--force` bypasses this. **This is a WORKFLOW.md NEVER rule, not a nicety.**
3. `git -C <member> worktree remove <path>` per member, then the workspace worktree.
4. `git worktree prune` in every member so registrations don't leak.

### `doctor [--from-hook]`

Must be fast and side-effect-free. No hashing, no installs, always exit 0 in hook mode. Checks:

1. Are all configured members materialized in this worktree?
2. Are they on the expected branch?
3. Are they hydrated?
4. Are there orphaned member worktrees whose workspace worktree is gone?

### Pitfalls that will bite

1. Git refuses to check out the same branch in two worktrees. Mirrored branch names are unique per workspace-worktree, so this is usually fine — but if a member's main clone is already on that exact branch, it collides. Catch it and give a clear error; don't guess a suffix.
2. `npm ci` deletes `node_modules` — see the table above.
3. **Sibling resolution.** In vafab, `vafab-forms-admin` resolves `@vafab/forms` via `../vafab-forms/src/index.ts` with no registry fallback. This is satisfied automatically once all members are materialized side-by-side, but write an explicit test that locks it — otherwise it regresses silently.
4. **CoW divergence.** Cloned `node_modules` consumes real disk as files get rewritten. `remove` must actually free it.
5. **Partial failure.** If member 3 of 5 fails, don't leave a half-built worktree with no notice. Either roll back or report exactly what exists and what's missing.

**Acceptance criteria:**

1. `add` creates the workspace worktree plus one member worktree per member, all on the mirrored branch.
2. Hydration produces runnable repos — build/test commands work in the worktree with no manual steps.
3. `add --dry-run` writes nothing, shows exactly what would happen.
4. `remove` refuses on uncommitted work without `--force`, naming what it found.
5. `remove` leaves no orphaned worktree registrations.
6. `doctor --from-hook` exits 0 even when everything is missing, and runs in under a second.
7. Works on a workspace with no `haus.workspace.yaml` (i.e. via the Task 3 bridge).

**Verification:**

```bash
haus workspace worktree add test-slug --dry-run
haus workspace worktree add test-slug
cd .claude/worktrees/test-slug && ls          # all members should be visible
git -C vafab-forms rev-parse --abbrev-ref HEAD  # should be test-slug
cd vafab-forms && yarn build                  # should work with no extra steps
cd ../.. && haus workspace worktree remove test-slug
git -C ../../vafab-forms worktree list        # no leftovers
```

---

## Task 5 — `SessionStart` hook as safety net

**Depends on:** Task 4.

Add the fragment `hook.workspace.worktree-check`, event `SessionStart`, command `haus workspace worktree doctor --from-hook`.

Must be added to all three hook lists (see Task 4's codebase facts / the parity test), and excluded from `library/global/settings-fragments/hooks.json` for the same reason the existing `SessionStart` hook is excluded (a global hook would fire in non-haus projects). Update `tests/hook-lists-parity.test.js` so the exception is documented.

Behavior: report by default. Auto-hydrate only when `worktree.autoHydrate: true` is set in config — a session start shouldn't silently spend minutes on installs.

Re `gate-default-off`: it exists as an enum value but has no opt-in path implemented (enforcement is a single `if (fragment.gate !== 'keep') continue`). Ship as `keep` and keep the behavior cheap/report-only rather than building the opt-in mechanism just for this.

**Acceptance criteria:**

1. Parity test passes.
2. The hook fires in an unhydrated worktree and gives a line with the exact fix command.
3. Exits 0 in all cases, even on error.
4. No measurable session-start delay in a normal project.
5. `haus undo` removes the hook.

---

## Task 6 — Documentation, ADRs, release

**Depends on:** Tasks 1-5.

1. ADR for the config source (Task 3) — bridge-now decision, alternative considered, why deferred.
2. ADR for untracking machine-local state (Task 2), with migration path. Note the `setup-answers.json` ambiguity explicitly in the ADR rather than silently deciding either way.
3. ADR for the worktree model (Task 4): real isolation vs symlinks, with the CoW measurement as justification.
4. `docusaurus-docs/workspace.mdx`: document the worktree flow; it already acknowledges the 3-file trap — update that section per the Task 3 decision.
5. CHANGELOG with a clear migration note.
6. Version strategy: new command + new hook are minor, but Task 2's untracking is a breaking change in practice. Decide consciously between a high-volume 1.5.0 CHANGELOG entry or a 2.0.0 — don't default silently.
7. Update the catalog repo only if a catalog item genuinely needs to change (e.g. the `writing-documentation` skill's `deep-context.json` path fix from Task 2). Don't touch `manifest.json` otherwise.

---

## Testing matrix

| Level       | What                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `resolveRoots()` against fixtures: main checkout, linked worktree, submodule, bare, non-git                                       |
| Unit        | `readMembers()` against both config sources plus `pathOverrides` and broken input                                                 |
| Integration | Temp git repo with member repos: `add`, assert layout and branches; `remove`, assert cleanup and refusal on a dirty tree          |
| Integration | Sibling-resolution: a relative import between two members resolves inside a worktree                                              |
| Integration | CoW correctness: content identical, writes independent. Skip the disk-delta assertion (not the whole test) on non-CoW filesystems |
| Regression  | `haus doctor` in a linked worktree writes no tracked files and reports the correct repo name                                      |
| Parity      | `tests/hook-lists-parity.test.js` with the new fragment                                                                           |

## Stop conditions

Per `WORKFLOW.md` → "Stop conditions": stop and ask when:

1. The `setup-answers.json` question (does it actually exist as a haus artifact anywhere, and if so what writes it) can't be resolved without checking directly against vafab-workspace or the ticket's author.
2. Task 2's untracking migration turns out capable of destroying data in any existing workspace.
3. Verification fails three times on the same task.

## Reference environment for verification

`vafab-workspace`: 5 members, two package managers (Yarn 4 and .NET), split across two git hosts (Azure DevOps and GitHub), one hard sibling dependency, and an already-poisoned `context-map.json` to verify the Task 2 migration against. Do not run destructive tests directly there without confirming with Tim first.
