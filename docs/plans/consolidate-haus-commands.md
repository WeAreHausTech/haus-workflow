# Consolidate haus commands into the haus-workflow skill

## Source docs

- `library/global/skills/haus-workflow/SKILL.md` (skill under change)
- `library/global/commands/{haus-setup,haus-clone,haus-cloneandsetup,haus-doctor,haus-fix}.md` (being removed)
- `src/claude/write-claude-files.ts`, `src/claude/managed-paths.ts` (project-local doctor stub being removed)
- `src/install/apply.ts` (global install — confirms rename/removal is auto-cleaned via orphan pruning)

## Context / decisions made

- **Everything goes through `/haus-workflow`.** The 5 standalone legacy commands
  (`/haus-setup`, `/haus-clone`, `/haus-cloneandsetup`, `/haus-doctor`, `/haus-fix`) are
  deleted outright — not renamed. Their procedure bodies move into the skill's own
  `references/` folder so the skill still has the content to run.
- **Fallback regression accepted.** Today only `haus-doctor.md` gets a project-committed
  copy (via `write-claude-files.ts`) so teammates without haus installed globally still see
  `/haus-doctor`. That fallback is removed with the rest, with no replacement — consistent
  with how `/haus-setup`, `/haus-clone`, `/haus-cloneandsetup`, `/haus-fix` already worked
  (global-install-only). Using any haus task going forward requires haus installed globally.
- **Global install cleans up on its own.** `src/install/apply.ts` diffs the current package's
  file list against the last-installed manifest and deletes orphaned files whose hash still
  matches (unless user-edited). Deleting the 5 command source files is enough — no manual
  migration/deprecation shim needed for the global `~/.claude/commands/` copies.
- **`haus-help` is a thin index, not a duplicate knowledge base.** It answers from the task
  table + already-loaded skill context and points to `docs/cli.md` / `docs/runbook.md` for
  depth — matches this repo's "docs are an index" convention and avoids drift.
- **`project:reinit`** = confirm, then `haus undo -y` (existing primitive: removes
  haus-managed project files, backs them up, preserves user content) followed by the
  `project:init` procedure end to end. No new CLI command needed.

## Tasks

### 1. Move long procedures into skill references

**What:** Create `library/global/skills/haus-workflow/references/{init,clone,cloneandsetup}.md`.
Move the body content (everything below the frontmatter) of `haus-setup.md`, `haus-clone.md`,
`haus-cloneandsetup.md` into these files verbatim (adjust only internal cross-references, e.g.
"run `project:clone`" stays a task-name reference, not a filename reference). `doctor` and `fix`
are short enough to stay inline in `SKILL.md` (see Task 2) — no reference file needed for them.

**Acceptance criteria:**

- `references/init.md`, `references/clone.md`, `references/cloneandsetup.md` exist with the
  full original procedure content, nothing lost.
- No file references `~/.claude/commands/haus-*.md` anywhere in the skill.

**Verification:** `grep -rn "haus-setup.md\|haus-clone.md\|haus-cloneandsetup.md\|haus-doctor.md\|haus-fix.md" library/global/skills/` returns nothing.

**Dependencies:** none.

---

### 2. Rewrite `SKILL.md`

**What:**

- Update Step 3 exceptions/procedures to say "Open and follow `references/init.md`" etc.
  instead of pointing at `~/.claude/commands/*.md`.
- Fold the former `haus-doctor.md` body (run → read verdict → relay plainly → offer fix,
  don't dump raw output) into the existing `project:doctor` / "After `haus doctor`" section,
  replacing the current one-line "Report findings clearly" with the fuller behavior.
- Add a new task **`project:fix`** (aliases `fix`) folding in the former `haus-fix.md`
  body (run doctor → if healthy stop → else run each suggested fix → re-run doctor → report)
  as a short inline procedure — no reference file needed.
- Add a new task **`project:reinit`** (aliases `reinit`, `re-init`) as a short inline
  procedure: confirm via `AskUserQuestion` (destructive but backed-up — removing all
  haus-managed project files and starting over), run `haus undo -y`, then follow
  `references/init.md` end to end.
- Add a new task **`help`** (aliases `?`) that skips Step 2 entirely (no command runs) —
  answer directly from the task table in this file, plus point to `docs/cli.md` and
  `docs/runbook.md` for deeper detail.
- Update the task alias table to include all 8 tasks (`project:init`, `project:clone`,
  `project:cloneandsetup`, `project:add-skills`, `project:refresh`, `project:doctor`,
  `project:fix`, `project:reinit`, `help`, plus the existing global `update`/`install`/`uninstall`).
- **Split the Step 1 menu.** The current single `AskUserQuestion` menu lists 6 options,
  already at/over the tool's 4-option-per-question cap. Adding `project:reinit` and `help`
  makes 8. Restructure into two grouped questions (≤4 options each), e.g. "Core project
  tasks" (init, refresh, doctor/fix, clone) and "More" (cloneandsetup, add-skills, reinit,
  help) — exact grouping is an editorial call at write time, not architecturally significant.

**Acceptance criteria:**

- Task alias table lists all tasks with correct scope/command/description.
- `project:reinit` and `help` fully specified with post-run steps.
- Step 1 menu construction respects the ≤4-options-per-question shape.
- `## Do not use when` section unchanged (still correct).

**Verification:** `tests/haus-workflow-skill.test.js` updated and passing (see Task 5);
manual read-through confirms no dangling reference to a deleted command file.

**Dependencies:** Task 1 (reference files must exist before SKILL.md points to them).

---

### 3. Delete the 5 legacy command files

**What:** `git rm library/global/commands/{haus-setup,haus-clone,haus-cloneandsetup,haus-doctor,haus-fix}.md`.

**Acceptance criteria:** files no longer exist; `haus install` no longer enumerates or installs them (confirmed by `collectSourceFiles` in `src/install/apply.ts`, which reads the directory listing — no code change needed there, it just sees fewer files).

**Verification:** `yarn build && node dist/cli.js install --dry-run` against a scratch `~/.claude` (or the existing install test suite) shows the 5 files marked for deletion via orphan-pruning, not creation.

**Dependencies:** Task 1 (content must be preserved in references first).

---

### 4. Remove the project-local `haus-doctor.md` stub

**What:** In `src/claude/write-claude-files.ts`:

- Remove `claudePath(root, 'commands', 'haus-doctor.md')` from the `coreFiles` array.
- Remove the `writeManagedText(root, claudePath(root, 'commands', 'haus-doctor.md'), 'Run \`haus doctor\`.', dryRun)` call.
- Update the "Driving haus" block text: replace
  ``The `/haus-workflow`, `/haus-setup`, `/haus-doctor`, and `/haus-fix` commands do the same.``
  with a line naming only `/haus-workflow` (e.g. "`/haus-workflow` does the same — pass a task like `doctor` or `fix`.").

In `src/claude/managed-paths.ts`:

- Remove `'commands/haus-doctor.md'` from `PROJECT_MANAGED_CLAUDE_REL`, leaving `['rules/haus.md']`.
  (Confirmed single caller: `undo.ts` via `coreManagedAbsolutePaths` — safe, no other consumer.)

**Acceptance criteria:** a fresh `haus apply --write` in a scratch project no longer creates `.claude/commands/haus-doctor.md`; `rules/haus.md` mentions only `/haus-workflow`.

**Verification:** `tests/generated-primitives-shape.test.js` and `tests/apply.test.js` updated (Task 5) and passing.

**Dependencies:** none (independent of Tasks 1–3, but ships in the same change since it's the concrete bug behind request #4).

---

### 5. Update/rename tests

**What:**

- `tests/haus-setup-command.test.js` → rewrite to read `library/global/skills/haus-workflow/references/init.md` instead of the deleted command file; keep the same content assertions (docs-skill path, `deep-context.json` mention, `haus recommend` ordering, opt-in flow).
- `tests/clone.test.js` → repoint any read of `haus-clone.md` to `references/clone.md`.
- `tests/haus-workflow-skill.test.js` → add coverage for the new `project:fix`, `project:reinit`, `help` tasks and the restructured menu; remove any assertion tied to the old command-file pointers.
- `tests/generated-primitives-shape.test.js` → remove the `cmdDoctor` read/assertion (line ~20, ~31) since `.claude/commands/haus-doctor.md` is no longer written.
- `tests/apply.test.js` → remove the "haus-doctor is retained" assertion (~line 318-319).
- `tests/install.test.js` → update the expected list of globally-installed command files (now excludes the 5 removed names).
- `tests/helpers/fixture-runner.js` → check its `haus-fix` reference; update or remove.
- `tests/doctor.test.js`, `tests/doctor-tamper.test.js`, `tests/managed-template.test.js` → re-run and confirm unaffected (their `haus-doctor` hits are temp-dir naming / generic header parsing, not the deleted file — verify, don't assume).

**Acceptance criteria:** `yarn test` green, no test references a deleted file path.

**Dependencies:** Tasks 1–4 (tests assert on the post-change state).

---

### 6. Update docs

**What:**

- `docs/cli.md`: replace the `/haus-setup`, `/haus-doctor`, `/haus-fix` bullets (~lines 69, 231, 233-234) with `/haus-workflow <task>` equivalents; add entries for `project:reinit` and `help`.
- `docs/runbook.md`: update the `/haus-setup` mentions (~lines 99, 121) to `/haus-workflow project:init` (or `setup`).
- Run the **writing-documentation** skill per this repo's own `CLAUDE.md` convention ("after setup, commands... changes, run writing-documentation and commit doc updates with the code change").

**Acceptance criteria:** no remaining doc references to the 5 deleted command names as user-facing entry points; `docs/SUMMARY.md` index still accurate.

**Verification:** `grep -rn "haus-setup\|haus-doctor\|haus-fix\b" docs/` returns nothing outside historical/changelog context.

**Dependencies:** Task 2 (task names must be final before documenting them).

---

### 7. CHANGELOG entry

**What:** Add an entry noting: legacy `/haus-setup`, `/haus-clone`, `/haus-cloneandsetup`,
`/haus-doctor`, `/haus-fix` slash commands removed — use `/haus-workflow <task>` instead
(e.g. `/haus-workflow project:init`); new `project:reinit` and `help` tasks added; fixes a bug
where project-local `.claude/commands/haus-doctor.md` was written with no description.

**Dependencies:** all prior tasks (summarizes the full change).

---

## Verification gate (whole plan)

- `yarn verify` (typecheck + lint + build + test) green.
- Manual smoke test in a scratch directory: `haus install`, then in that directory confirm
  `~/.claude/commands/` no longer has the 5 old files (after a `haus update`/re-install to
  trigger orphan pruning) and `~/.claude/skills/haus-workflow/SKILL.md` (+ `references/`)
  is present and readable.
- Read through the rewritten `SKILL.md` end to end once for dangling references (grep pass
  in Task 1/6 verification, plus a human read).

## Explicitly out of scope

- Changing the external `haus-workflow-catalog` (73 skills / 15 agents / 4 templates / 2 configs) — untouched.
- Any change to `haus undo`, `haus setup-project`, or other CLI primitives — reused as-is.
