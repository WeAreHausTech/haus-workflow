---
name: haus-workflow
description: Haus all-in-one workflow skill. Handles project setup, update, catalog refresh, and CLAUDE.md regeneration. Invoke with a task name or without to get a menu.
---

# haus-workflow

All-in-one entry point for the Haus AI workflow.

## Invocation

`/haus-workflow [task]`

`task` is optional. If omitted, present a task menu (see below). If provided, map it to a command and run immediately.

## Task aliases → commands

Task names use an asymmetric scope convention. The **project:** namespace marks tasks that
act on **this repo** (`./.claude`, `./.haus-workflow`) — type `project:` to see them all.
The unprefixed verbs (`update`, `catalog`, `install`, `uninstall`) act on **this machine's
haus install** (`~/.claude`, npm) — they manage the haus tool itself, like `npm install -g`.
The short legacy aliases still work but the names below are canonical.

| Task name (legacy aliases)                                        | Command                 | Scope   | What it does                                                                                                              |
| ----------------------------------------------------------------- | ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `project:init` (`setup`, `init`)                                  | _Setup procedure below_ | project | First-time setup of an **existing** repo: adds AI skills, commands, workflow + project docs                               |
| `project:cloneandsetup` (`cloneandsetup`, `clone`)                | _Clone procedure below_ | project | Bring a **workspace** up from a bare checkout: clone (or reuse local) every member repo (per-repo setup is not wired yet) |
| `project:refresh` (`apply`, `refresh`, `claude-md`, `regenerate`) | `haus apply --write`    | project | Re-run setup / refresh `.claude/` context + regenerate root `CLAUDE.md` import block                                      |
| `project:doctor` (`doctor`, `check`)                              | `haus doctor`           | project | Check for install drift                                                                                                   |
| `update` (`upgrade`)                                              | `haus update`           | global  | Update npm package + catalog + `~/.claude/` (also refreshes this project)                                                 |
| `catalog`                                                         | `haus update`           | global  | Fetch latest catalog (same command as update)                                                                             |
| `install` (`global`)                                              | `haus install`          | global  | Seed `~/.claude/` with haus-owned files                                                                                   |
| `uninstall`                                                       | `haus uninstall`        | global  | Remove all haus global files from `~/.claude/`                                                                            |

## Step 1 — Determine the task

**If a task argument was passed:** look it up in the alias table above. If no match, tell the user and list valid options. If matched, skip to Step 2.

**If no task was passed:** use `AskUserQuestion` to present this menu:

```
Question: "What would you like to do?"
Options:
  1. [project] project:init — add haus to an existing project for the first time
     (AI skills + commands + workflow into a repo you already have, then a deep read to write the CLAUDE.md docs body + docs/)
  2. [project] project:refresh — refresh this project's setup
     (haus apply --write — re-runs setup, regenerates CLAUDE.md imports)
  3. [global] update — update haus package + catalog + global files
     (haus update — checks npm for new version, fetches catalog, refreshes ~/.claude/)
  4. [global] catalog — fetch catalog updates only
     (haus update — same command; pulls latest workflow templates and lockfile)
  5. [project] project:cloneandsetup — clone a workspace's repos
     (loops repos.manifest.json, cloning each repo via `haus clone <url>`; setup comes later)
```

Map the user's selection to the command from the alias table, then continue to Step 2.

## Step 2 — Run the command

Run the mapped command via Bash. Quote the exact command you are running before executing it.

**Exception — `project:init` (`setup` / `init`):** this maps to a multi-step procedure, not a single command. Do not run a bare `haus init`. Skip to **Setup (`project:init`)** under Step 3 and follow it.

**Exception — `project:cloneandsetup` (`cloneandsetup` / `clone`):** this asks the user a question before running, so it is a short procedure too. Skip to **Clone & setup (`project:cloneandsetup`)** under Step 3 and follow it.

## Step 3 — Post-run steps

After the command completes, follow the relevant post-run steps below.

### Setup (`project:init`)

1. Open and follow `~/.claude/commands/haus-setup.md` — the installed `haus-setup` command (in some projects also `.claude/commands/haus-setup.md`). Run every step in order. It detects the stack, asks the guided questions, runs `haus apply --write` (scaffolding, skills, commands, rules, docs skill), writes the **project docs** (`CLAUDE.md` body + `docs/`) and `.haus-workflow/deep-context.json`, runs `haus recommend`, applies the newly-matched helpers, and confirms.
2. Then fill `.haus-workflow/workflow-config.md` — replace every placeholder (`TODO`, `n/a`, empty): test/lint/typecheck/build commands (check `package.json`), docs paths, validation library, pre-commit tool, highest-stakes logic (ask if unclear). Leave none.

### Clone (`project:cloneandsetup`)

1. Open and follow `~/.claude/commands/haus-clone.md` — the installed `haus-clone` command. It checks for `repos.manifest.json`, asks how to obtain the repos (clean clone vs reuse local), loops over the manifest, and clones each repo via `haus clone <url> <folder>`. Per-repo setup (install, Docker, env) is a separate step that isn't wired yet, so just get the repos in place for now.

### After `haus apply --write`

Verify that the root `CLAUDE.md` imports all three haus files:

```
@.haus-workflow/WORKFLOW.md
@.haus-workflow/workflow-config.md
@.haus-workflow/project.md
```

If any import is missing, add it.

### After `haus update`

1. If CLI output says a new version is available, run `npm i -g @haus-tech/haus-workflow` and confirm the version bump.
2. If `WORKFLOW.md` was updated, remind the user: "WORKFLOW.md updated — review `workflow-config.md` for any new sections that need project-specific values."
3. If CLI output shows catalog changes, summarise which templates changed.

### After `haus doctor`

Report findings clearly. For each drift item, suggest the exact fix command.

### After `haus install` / `haus uninstall`

Confirm which files were written to or removed from `~/.claude/`. No further steps.

## Do not use when

- User needs a security, code, or test review — use the dedicated reviewer agents instead.
- User asks about workflow concepts or wants to understand the WORKFLOW.md standard — answer directly from the loaded context.
