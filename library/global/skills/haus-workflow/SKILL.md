<!-- HAUS-MANAGED id=skill.haus-workflow v=1 source=@haus-tech/haus-workflow@0.1.0 -->
---
name: haus-workflow
description: Haus all-in-one workflow skill. Handles project setup, update, catalog refresh, and CLAUDE.md regeneration.
---

# haus-workflow

All-in-one entry point for the Haus AI workflow. Covers setup, update, sync, catalog refresh, and root `CLAUDE.md` regeneration.

## Use when

- Setting up a project for the first time (`haus init`).
- Updating an existing project setup (`.claude/` + `.haus-workflow/`).
- Checking for a newer `@haus-tech/haus-workflow` package and refreshing `~/.claude/` accordingly.
- Fetching catalog updates (`haus update`).
- Regenerating the root `CLAUDE.md` import block.

## Do not use when

- User needs a security, code, or test review — use the dedicated reviewer agents instead.

## How to invoke

Run the relevant CLI command for the task:

| Goal | Command |
|---|---|
| First-time project setup | `haus init` |
| Re-run setup / refresh context | `haus apply --write` |
| Update package + catalog + `~/.claude/` | `haus update` |
| Check install drift | `haus doctor` |
| Install global haus files into `~/.claude/` | `haus install` |
| Remove all haus global files | `haus uninstall` |

## Setup flow (init)

1. Run `haus init` in the project root.
2. Haus scans the repo, generates `.haus-workflow/context-map.json` and `.haus-workflow/recommendation.json`.
3. Writes `.haus-workflow/haus-way-of-work.md` (from catalog template) and `.haus-workflow/project.md`.
4. Ensures root `CLAUDE.md` contains the `<!-- HAUS:BEGIN haus-imports -->` block with `@import` lines.
5. Prints a summary; user confirms before writes.

## Update flow

`haus update` runs in order:
1. Checks installed npm package version vs. latest on registry. If newer: prints `npm i -g @haus-tech/haus-workflow` instruction.
2. After any version change, re-runs `haus install` to refresh `~/.claude/` haus files.
3. Fetches latest catalog from `haus-workflow-catalog`, writes cache, updates lockfile.
4. Re-renders `.haus-workflow/haus-way-of-work.md` and `.haus-workflow/project.md`.

## Global install

`haus install` seeds `~/.claude/` with haus-owned files. Each file carries a `<!-- HAUS-MANAGED ... -->` header so the CLI can update or remove it safely without touching user content.

`haus uninstall` reverses this: removes every HAUS-MANAGED file and strips haus hook entries from `~/.claude/settings.json`. User-owned files are never deleted.
