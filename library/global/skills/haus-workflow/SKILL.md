## <!-- HAUS-MANAGED id=skill.haus-workflow v=2 source=@haus-tech/haus-workflow@0.1.0 -->

name: haus-workflow
description: Haus all-in-one workflow skill. Handles project setup, update, catalog refresh, and CLAUDE.md regeneration. Invoke with a task name or without to get a menu.

---

# haus-workflow

All-in-one entry point for the Haus AI workflow.

## Invocation

`/haus-workflow [task]`

`task` is optional. If omitted, present a task menu (see below). If provided, map it to a command and run immediately.

## Task aliases → commands

| Alias(es)                            | Command              | What it does                                   |
| ------------------------------------ | -------------------- | ---------------------------------------------- |
| `init`, `setup`                      | `haus init`          | First-time project setup                       |
| `apply`, `refresh`, `update-project` | `haus apply --write` | Re-run setup / refresh `.claude/` context      |
| `update`, `upgrade`                  | `haus update`        | Update npm package + catalog + `~/.claude/`    |
| `catalog`                            | `haus update`        | Fetch latest catalog (same command as update)  |
| `doctor`, `check`                    | `haus doctor`        | Check for install drift                        |
| `install`, `global`                  | `haus install`       | Seed `~/.claude/` with haus-owned files        |
| `uninstall`                          | `haus uninstall`     | Remove all haus global files from `~/.claude/` |
| `claude-md`, `regenerate`            | `haus apply --write` | Regenerate root `CLAUDE.md` import block       |

## Step 1 — Determine the task

**If a task argument was passed:** look it up in the alias table above. If no match, tell the user and list valid options. If matched, skip to Step 2.

**If no task was passed:** use `AskUserQuestion` to present this menu:

```
Question: "What would you like to do?"
Options:
  1. Set up this project for the first time
     (haus init — scans repo, writes .haus-workflow/, updates CLAUDE.md)
  2. Refresh project setup
     (haus apply --write — re-runs setup, regenerates CLAUDE.md imports)
  3. Update haus package + catalog + global files
     (haus update — checks npm for new version, fetches catalog, refreshes ~/.claude/)
  4. Fetch catalog updates only
     (haus update — same command; pulls latest workflow templates and lockfile)
  5. Regenerate CLAUDE.md import block
     (haus apply --write — rewrites the @-import block at the root CLAUDE.md)
```

Map the user's selection to the command from the alias table, then continue to Step 2.

## Step 2 — Run the command

Run the mapped command via Bash. Quote the exact command you are running before executing it.

## Step 3 — Post-run steps

After the command completes, follow the relevant post-run steps below.

### After `haus init`

1. Open `.haus-workflow/workflow-config.md`.
2. Check for unfilled placeholders (`TODO`, `n/a`, empty values) in:
   - Test, lint, typecheck, build commands — confirm against `package.json` scripts.
   - Docs paths — check whether `docs/SPEC.md`, `docs/DESIGN.md`, `docs/UX.md` exist.
   - Validation library — check `package.json` dependencies for `zod`, `yup`, `joi`, `valibot`.
   - Pre-commit tool — check for `.husky/`, `lefthook.yml`, `.pre-commit-config.yaml`.
   - Highest-stakes logic — ask the user if unclear.
3. Fill in every unfilled field. Do not leave placeholders.
4. Confirm with the user that `workflow-config.md` is complete before proceeding.

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
