# Field Reports — Docs Install Prompt, Slash-Menu Pagination, Clone Args & Conflict

**Goal:** Fix the 3 user-reported issues logged in the audit artifact's "Field reports" section: the docs site's install page is missing the README's Claude-paste prompt, the `/haus-workflow` no-arg menu can't reach 4 of its 12 tasks, `project:clone`/`project:cloneandsetup` never ask which repo/workspace when invoked from the menu, and `haus clone` silently "skips" an existing target directory with no check that it's actually the right repo.

**Architecture:** Spans two repos. Task A's fix lands in the sibling docs site repo (`wearehaustech.github.io`), not this one — its own worktree/branch, since it has its own build/lint/test tooling. Tasks B, C, D are all in this repo (`haus-workflow`) and all touch the `haus-workflow` skill (`library/global/skills/haus-workflow/`); B and C are skill-prompt edits only (no `src/` changes, no new tests in the CLI's Node test suite — skills aren't unit-testable that way, verification is a manual conversational walkthrough). D is the one task with real `src/` code and gets a proper regression test.

**Tech Stack:** No new dependencies. D reuses `runGit`/`execa` already in `src/utils/exec.ts`. B/C are pure Markdown/prompt-engineering changes to `SKILL.md` and `references/clone.md`.

**Reference:** [haus-workflow audit artifact](https://claude.ai/code/artifact/1abe9002-8ef0-4680-b2ab-3215aa4cf7bd), "Field reports" section (fr-1, fr-2, fr-3).

---

### Task A (fr-1): Docs site install page gets the README's Claude-paste prompt

**Goal:** `wearehaustech.github.io/docs/haus-workflow/getting-started.mdx` "Install" section (lines 15-19) shows only the raw terminal command. `haus-workflow/README.md` (lines 11-19) additionally has a ready-to-paste Claude Code prompt:

```
Install the haus-workflow CLI globally by running `npm install -g @haus-tech/haus-workflow`.
```

Bring the docs site up to parity.

**Repo:** `wearehaustech.github.io` (separate repo — this task does not touch `haus-workflow`).

**Files:**

- Modify: `docs/haus-workflow/getting-started.mdx` (the "Install" section, right after the existing `npm install -g @haus-tech/haus-workflow` code block)

**Acceptance Criteria:**

- [ ] The "Install" section on the docs site shows both the terminal command (unchanged) and a "paste this into Claude Code" block containing the exact same instruction text as `haus-workflow/README.md`.
- [ ] The two copies (README and docs site) are either sourced from one place, or carry an explicit HTML comment (`<!-- keep in sync with haus-workflow/README.md's install prompt -->`) so a future edit to one is a visible prompt to check the other — this repo has no existing mechanism to enforce cross-repo text parity, so a comment is the honest minimum, not silent duplication.
- [ ] No other content on the page changes (prerequisites, postinstall behavior, disable-postinstall note all stay as-is).

**Verify:** Manual — `yarn start` (Docusaurus dev server) in `wearehaustech.github.io`, view the rendered "Getting started" page, confirm the prompt block renders correctly and reads identically to the README's.

---

### Task B (fr-2, part 1): No-arg menu must reach all 12 tasks, not just 8

**Goal:** `SKILL.md`'s Step 1 (lines 45-72) already splits the menu into two sequential `AskUserQuestion` calls (4 options each) — a real pagination pattern, not a naive dump. But it only covers 8 of the 12 tasks in the alias table (lines 26-39): `project:doctor`, `project:fix`, `install`, and `uninstall` are never offered in either question. A user who doesn't already know those names has no guided path to them — worse than being one "Other" tap away, they're invisible.

**Files:**

- Modify: `library/global/skills/haus-workflow/SKILL.md` (Step 1, lines 45-72)

**Acceptance Criteria:**

- [ ] All 12 tasks from the alias table are reachable through the guided menu, not just 8.
- [ ] The menu keeps the existing 4-options-per-question structure (matches `AskUserQuestion`'s real limit) but adds a genuine third question, or turns the last slot of Question 2 into an explicit "More options" choice that leads to Question 3 — the mechanism must generalize (if a 13th task is added later, it should be obvious where it goes), not be a one-off fix for exactly 12.
- [ ] Each question's final/extra slot is a _named, self-describing_ option (e.g. "More options — see doctor, fix, install, uninstall"), not a bare "Other" — "Other" already exists as the platform's own free-text fallback and is not this skill's to repurpose; this fix is about the skill offering a real next-page option in one of its own 4 slots.
- [ ] `help` is not competing for a slot that pushes out a real task — verify the final layout by listing all 12 + confirming none are dropped.
- [ ] Selecting any of the previously-unreachable 4 tasks from the new page maps correctly to its command per the alias table (no new alias-table entries needed — mapping already exists, only menu visibility changes).

**Verify:** Manual — walk through `/haus-workflow` with no argument in a live Claude Code session, confirm all 12 tasks are reachable via the guided menu path (not "Other" free text) within at most 3 questions, and that selecting each of the 4 previously-missing tasks runs the correct command.

---

### Task C (fr-2, part 2): `project:clone` / `project:cloneandsetup` ask for name + single-repo-vs-workspace when reached via the menu

**Goal:** `references/clone.md` picks Mode A (single repo, by name) vs. Mode B (whole workspace, via `repos.manifest.json`) purely by whether a `name` argument is present (line 5: "There are two modes, chosen by whether a name was given"). That works when the user types `/haus-workflow project:clone myrepo` directly. It does **not** work when they reach `project:clone`/`project:cloneandsetup` through the guided menu (Task B above) — the menu option is just a label; selecting it captures no name and no mode, so the procedure silently falls through to Mode B (workspace) regardless of what the user actually wanted, per `SKILL.md`'s current Step 1 Question 1 option 3 wording ("no name: clone a workspace... with a name: find & clone one repo").

**Files:**

- Modify: `library/global/skills/haus-workflow/references/clone.md` — add a new step 0, before the existing "Mode A" / "Mode B" split
- Modify: `library/global/skills/haus-workflow/SKILL.md` — the "Clone (`project:clone`)" and "Clone & setup (`project:cloneandsetup`)" sections under Step 3 (lines 138-144), noting that a name may already be known (typed as an argument) and to skip the new step 0 in that case

**Acceptance Criteria:**

- [ ] When `project:clone` or `project:cloneandsetup` is reached with **no name already known** (menu path, or typed with no argument), the procedure asks one `AskUserQuestion` up front: "Clone a single repo, or a whole workspace?" with options for each, before doing anything else.
- [ ] If the user picks "single repo," ask for the name/identifier as a follow-up (free text is fine here — it feeds straight into existing Mode A's GitHub search, which already handles 0/1/2+ matches), then proceed into the existing Mode A flow unchanged.
- [ ] If the user picks "whole workspace," proceed into the existing Mode B flow unchanged (still requires `repos.manifest.json` at the workspace root, still asks clean-clone vs. already-have-some vs. cancel exactly as today).
- [ ] When a name **was already given** as an argument (`/haus-workflow project:clone myrepo`), this new step is skipped entirely — behavior for that path is byte-for-byte unchanged from today (no new question, straight into Mode A as before).
- [ ] `project:cloneandsetup` gets the same new step-0 behavior via its shared use of `clone.md` — no separate copy of this logic in `cloneandsetup.md`.

**Verify:** Manual — invoke `project:clone` from the guided menu (no name), confirm the single-repo-vs-workspace question appears before either mode's existing flow; invoke `/haus-workflow project:clone <name>` directly, confirm no new question appears and behavior matches pre-change.

---

### Task D (fr-3): `haus clone` distinguishes a genuine already-cloned match from an unrelated name collision

**Goal:** `src/commands/clone.ts:76-79` skips silently on `existsSync(target)` alone — no check that the existing directory is actually a git checkout of the intended URL. A user sitting inside (or having previously created) a directory that happens to share the target name gets a false "already present — skipped" with no way to tell the difference from a real prior clone, and no offered way out.

**Files:**

- Modify: `src/commands/clone.ts`
- Modify: `tests/clone.test.js` (create if it doesn't exist — check first)

**Acceptance Criteria:**

- [ ] When `target` exists and is a git repo whose `origin` remote matches the requested `url` (compare via `git -C <target> remote get-url origin`, tolerant of `.git` suffix / SSH-vs-HTTPS form differences), report a clear "already cloned here, matches `<url>` — skipped" and exit 0 — this is the correct, common case and must stay silent-ish and non-alarming.
- [ ] When `target` exists but is **not** a git repo, or is a git repo whose `origin` does **not** match, report a clear conflict: name the mismatch (existing remote vs. requested URL, or "not a git repository"), and **do not** silently report success — exit non-zero, since this is a real problem the caller (the `project:clone`/`project:cloneandsetup` skill procedures, per Task C) needs to see and relay to the user rather than swallow.
- [ ] `--dry-run` against an existing-but-mismatched target reports what the conflict is without side effects (same detection, no exit-code change expected from dry-run's existing contract elsewhere in this codebase — match `apply --dry-run`'s convention of reporting, not silently passing).
- [ ] `references/clone.md` (Task C's file) gets one added line in its "report the result" step (line 23 / line 41 area) telling the assistant what to do on this new conflict-reported case: relay the exact mismatch to the user and offer to clone into an alternate directory name (`<name>-2` or user-specified) rather than just repeating the raw CLI error.
- [ ] The existing idempotent-skip behavior for a genuinely-matching prior clone is unchanged in the common case — this task only adds detection for the case that previously produced a false-positive "skipped."

**Verify:** `node scripts/run-tests.mjs tests/clone.test.js` → covers: (a) fresh target, clones normally; (b) existing target with matching origin, skips with the new "matches" message, exit 0; (c) existing target that's a git repo with a different origin, reports conflict, exit 1; (d) existing target that's not a git repo at all (e.g. an empty dir or unrelated files), reports conflict, exit 1; (e) `--dry-run` against case (c)/(d) reports the conflict without touching disk.
