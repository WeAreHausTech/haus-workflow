---
name: haus-workflow
description: Haus all-in-one workflow skill. Handles project setup, re-init, update, catalog refresh, health checks, and CLAUDE.md regeneration. Invoke with a task name or without to get a menu.
---

# haus-workflow

All-in-one entry point for the Haus AI workflow. Everything haus-related runs through
this skill — there are no separate `/haus-setup`, `/haus-clone`, `/haus-cloneandsetup`,
`/haus-doctor`, or `/haus-fix` commands.

## Invocation

`/haus-workflow [task]`

`task` is optional. If omitted, present a task menu (see below). If provided, map it to a command and run immediately.

## Task aliases → commands

Task names use an asymmetric scope convention. The **project:** namespace marks tasks that
act on **this repo** (`./.claude`, `./.haus-workflow`) — type `project:` to see them all.
The unprefixed verbs (`update`, `install`, `uninstall`, `help`) act on **this machine's
haus install** (`~/.claude`, npm) or are purely informational — they don't act on this
repo's files. The short legacy aliases still work but the names below are canonical.

| Task name (legacy aliases)                                        | Command                         | Scope   | What it does                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project:init` (`setup`, `init`)                                  | _Setup procedure below_         | project | First-time setup of an **existing** repo: adds AI skills, commands, workflow + project docs                                                                                                                                                                                               |
| `project:reinit` (`reinit`, `re-init`)                            | _Reinit procedure below_        | project | **Full re-setup.** Removes all haus-managed project files (backed up first, user content preserved), then re-runs `project:init` from scratch                                                                                                                                             |
| `project:clone [name]` (`clone`)                                  | _Clone procedure below_         | project | No name: clone a **workspace**'s repos from `repos.manifest.json`. With a `name`: find & clone one repo by name from GitHub                                                                                                                                                               |
| `project:cloneandsetup [name]` (`cloneandsetup`)                  | _Clone & setup procedure below_ | project | Run `project:clone`, then set up each repo for local dev — deps, databases, cross-repo links, and env — via each repo's `.haus-workflow/localdev.yml` (+ the workspace's order/links/env)                                                                                                 |
| `project:add-skills` (`add-skills`, `opt-in`)                     | _Add-skills procedure below_    | project | Add optional skills, agents, or config (ESLint/Prettier) to an already-set-up project without re-running full setup                                                                                                                                                                       |
| `project:refresh` (`apply`, `refresh`, `claude-md`, `regenerate`) | _Refresh procedure below_       | project | **Full non-destructive sync.** Updates the haus package + catalog first, then re-runs `project:init`'s pipeline in place — nothing is removed up front; new catalog items get added, changed ones updated, and anything removed upstream gets pruned by `apply`'s existing orphan-pruning |
| `project:doctor` (`doctor`, `check`)                              | `haus doctor`                   | project | Check for install drift                                                                                                                                                                                                                                                                   |
| `project:fix` (`fix`)                                             | _Fix procedure below_           | project | Diagnose and fix install drift: run doctor, apply the suggested fixes, confirm green                                                                                                                                                                                                      |
| `update` (`upgrade`)                                              | `haus update`                   | global  | Update npm package + catalog + `~/.claude/` (also refreshes this project)                                                                                                                                                                                                                 |
| `install` (`global`)                                              | `haus install`                  | global  | Seed `~/.claude/` with haus-owned files                                                                                                                                                                                                                                                   |
| `uninstall`                                                       | `haus uninstall`                | global  | Remove all haus global files from `~/.claude/`                                                                                                                                                                                                                                            |
| `help` (`?`)                                                      | _Answer directly below_         | —       | Explain what haus-workflow is, list available tasks, point to deeper docs — touches no files                                                                                                                                                                                              |

## Step 1 — Determine the task

**If a task argument was passed:** look it up in the alias table above. If no match, tell the user and list valid options. If matched, skip to Step 2.

**If no task was passed:** the menu has more options than one `AskUserQuestion` question can
hold (max 4 options per question). Ask two separate questions, one after another — first
Question 1, read the answer, then ask Question 2 (a second, sequential `AskUserQuestion`
call; do not try to cram both into a single question):

```
Question 1: "What would you like to do?"
Options:
  1. [project] project:init — add haus to an existing project for the first time
     (AI skills + commands + workflow into a repo you already have, then a deep read to write the CLAUDE.md docs body + docs/)
  2. [project] project:refresh — full non-destructive sync with the latest haus
     (updates the haus package + catalog, then re-runs setup in place — nothing removed first)
  3. [project] project:clone [name] — clone repos
     (no name: clone a workspace from repos.manifest.json; with a name: find & clone one repo by name from GitHub)
  4. [project] project:cloneandsetup [name] — clone repos, then set them up for local dev
     (project:clone, then per-repo deps + databases + cross-repo links + env from localdev.yml)

Question 2: "Anything else?"
Options:
  1. [project] project:add-skills — add optional skills, agents, or config to this project
     (offers opt-in helpers matching your stack that aren't installed yet — no full re-setup)
  2. [project] project:reinit — full re-setup from scratch
     (removes all haus-managed project files, backed up first, then re-runs project:init)
  3. [global] update — update haus package + catalog + global files
     (haus update — checks npm for new version, fetches catalog, refreshes ~/.claude/)
```

Map the user's selection to the command from the alias table, then continue to Step 2.

## Step 2 — Run the command

Run the mapped command via Bash. Quote the exact command you are running before executing it.

**Exception — `project:init` (`setup` / `init`):** this maps to a multi-step procedure, not a single command. Do not run a bare `haus init`. Skip to **Setup (`project:init`)** under Step 3 and follow it.

**Exception — `project:reinit` (`reinit` / `re-init`):** removes files before re-running setup. Skip to **Reinit (`project:reinit`)** under Step 3 and follow it.

**Exception — `project:clone` (`clone`):** this asks the user a question before running, so it is a short procedure too. Skip to **Clone (`project:clone`)** under Step 3 and follow it.

**Exception — `project:cloneandsetup` (`cloneandsetup`):** clone followed by a per-repo setup pass, with confirmations. Skip to **Clone & setup (`project:cloneandsetup`)** under Step 3 and follow it.

**Exception — `project:add-skills` (`add-skills` / `opt-in`):** a short scan → recommend → choose → apply procedure. Skip to **Add optional skills (`project:add-skills`)** under Step 3 and follow it.

**Exception — `project:refresh` (`apply` / `refresh` / `claude-md` / `regenerate`):** updates the haus package first, then re-runs the setup pipeline — not a single command. Skip to **Refresh (`project:refresh`)** under Step 3 and follow it.

**Exception — `project:fix` (`fix`):** diagnose-then-fix loop, not a single command. Skip to **Fix (`project:fix`)** under Step 3 and follow it.

**Exception — `help` (`?`):** no command runs at all. Skip Step 2 and Step 3 — answer directly from the task alias table above, plus `docs/cli.md` and `docs/runbook.md` for deeper detail on any specific task.

## Step 3 — Post-run steps

After the command completes, follow the relevant post-run steps below.

### Setup (`project:init`)

1. Open and follow `references/init.md` in this skill's directory. Run every step in order. It detects the stack, runs `haus apply --write` (scaffolding, skills, commands, rules, docs skill), writes the **project docs** (`CLAUDE.md` body + `docs/`) and `.haus-workflow/deep-context.json`, runs `haus recommend`, applies the newly-matched helpers, and confirms.
2. Then fill `.haus-workflow/workflow-config.md` — replace every placeholder (`TODO`, `n/a`, empty): test/lint/typecheck/build commands (check `package.json`), docs paths, validation library, pre-commit tool, highest-stakes logic (ask if unclear). Leave none.

### Reinit (`project:reinit`)

Full re-setup — removes everything haus manages in this project and starts over. Use when
the project's haus setup is badly out of sync and a plain `project:fix`/`project:refresh`
isn't enough, or the user explicitly wants a clean slate.

1. **Confirm first, always** — via `AskUserQuestion`. Explain plainly: this removes all
   haus-managed files in this project (commands, skills, rules, workflow docs; `haus undo`
   backs them up first and never touches user-owned `.claude/` content or `.haus-workflow`
   docs you've edited), then re-runs setup from scratch. Offer **Cancel**.
2. On confirm, run `haus undo --yes` (already backs up + preserves user content — no need
   to ask a second time).
3. Immediately follow **Setup (`project:init`)** above, end to end.
4. Report what was removed, backed up (path), and re-added, in plain language.

### Refresh (`project:refresh`)

Full non-destructive sync — nothing is removed up front (contrast with `project:reinit`,
which wipes first). Use for routine "bring this project up to date with the latest haus"
maintenance: new catalog items get added, changed ones updated, and anything removed
upstream gets pruned automatically by `apply`'s existing orphan-pruning.

1. Run `haus update`. This bumps the npm package (or reports one's available), syncs the
   catalog cache, refreshes `~/.claude/`, and does a light re-apply of this project's
   already-tracked files.
2. Immediately follow **Setup (`project:init`)** above, end to end. Re-running it is safe
   on an already-set-up project — it re-scans, re-applies, redoes the deep docs read (so
   `CLAUDE.md`/`docs/` catch up with any code drift), and re-recommends against the
   now-current catalog.
3. Report what changed in plain language — package/catalog version bumps, docs
   refreshed, helpers added/updated/removed.

### Clone (`project:clone`)

1. Open and follow `references/clone.md` in this skill's directory. With a `name` argument it finds and clones one matching repo from GitHub; with no argument it clones a workspace's repos from `repos.manifest.json`. This task only clones — to also install dependencies, use `project:cloneandsetup`.

### Clone & setup (`project:cloneandsetup`)

1. Open and follow `references/cloneandsetup.md` in this skill's directory — it runs the full `project:clone` flow, then sets up each cloned repo locally: selects the node version (`nvm install` from `.nvmrc`), enables corepack, installs JS/PHP dependencies, and seeds `.env`, confirming before each phase. It does not start servers.

### Add optional skills (`project:add-skills`)

For a project that's already set up but where the user wants more helpers later —
without re-running the full `project:init` flow. Never show raw JSON; offer plain
choices.

1. Refresh the picture: run `haus scan --json` then `haus recommend` (it re-reads
   `.haus-workflow/deep-context.json` if present).
2. Read `.haus-workflow/recommendation.json` and `.haus-workflow/haus.lock.json`
   yourself. Build the choices from items **not already installed** (lock ids):
   - **Optional skills & agents** — `optInEligible[]`, grouped by `optInGroup`
     (each carries `purpose` + `tokenEstimate` for a plain-language label).
   - **Project config** — `recommended[]` entries with `install: false` (Haus
     ESLint / Prettier) whose files aren't already present.
3. If nothing is eligible, say so plainly and stop — e.g. "Everything matching
   your stack is already installed" or "No optional helpers for this stack."
4. Otherwise present a single `AskUserQuestion` (multi-select, all unchecked)
   with one option per group / config item. Then:
   - Skills/agents → `haus recommend --include <id> <id> …`, then
     `haus apply --write`.
   - Config → `haus scaffold <id>` (add `--force` only if the user chose to
     replace an existing file; scaffold preserves files by default).
5. Confirm with the names added and their combined token estimate, e.g.
   "Added 2 optional helpers: Code review workflow, TDD workflow (~3k tokens)."

### Fix (`project:fix`)

1. Run `haus doctor` and read the verdict.
2. If the project is already healthy, say so in one line and stop.
3. Otherwise, for each item that needs attention, run the exact fix command the
   doctor named (commonly `haus apply --write` or `haus apply --refill-config`).
4. Re-run `haus doctor` to confirm the verdict is now green.
5. Report what you changed in plain language — what was wrong, what you ran, and
   that it's now resolved.

Only run haus commands and the fixes the doctor suggests. If a fix needs a
decision you can't make safely, stop and ask in plain language.

### After `haus update`

1. If CLI output says a new version is available, run `npm i -g @haus-tech/haus-workflow` and confirm the version bump.
2. If `WORKFLOW.md` was updated, remind the user: "WORKFLOW.md updated — review `workflow-config.md` for any new sections that need project-specific values."
3. If CLI output shows catalog changes, summarise which templates changed.

### After `haus doctor` (`project:doctor`)

1. Read the output. The first line is a plain-language verdict (green = healthy,
   amber = things need attention).
2. Relay that verdict to the person in one or two sentences. If anything needs
   attention, list each item as a short sentence plus the exact command that
   fixes it — and offer to run the fix for them (or suggest `project:fix`).

Don't show raw command output unless they ask for detail.

### After `haus install` / `haus uninstall`

Confirm which files were written to or removed from `~/.claude/`. No further steps.

## Do not use when

- User needs a security, code, or test review — use the dedicated reviewer agents instead.
- User asks about workflow concepts or wants to understand the WORKFLOW.md standard — answer directly from the loaded context.
