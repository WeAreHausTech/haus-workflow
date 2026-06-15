# haus-workflow

CLI that scans repos, recommends context assets, and writes controlled outputs into `.claude/` and `.haus-workflow/`. Published to npm as `@haus-tech/haus-workflow`. Internal Haus tool; open-source but unsupported for external use.

## Agent Context Guide

- Use this file as the documentation index; open detail docs from the tables below only when needed.
- Start with **CLAUDE.md** for setup, commands, conventions, and pre-PR checks.
- Route by task (load one primary topic, not every file):
  - **Run / develop locally** → [dev.md](dev.md)
  - **Code change** → [codebase.md](codebase.md); add [architecture.md](architecture.md) for cross-cutting or integration changes
  - **CLI surface** → [cli.md](cli.md)
  - **Ship / release** → [dev.md](dev.md) (Release section)
  - **Security boundaries** → [security.md](security.md)
  - **Failure / debugging** → [runbook.md](runbook.md)
- Prefer path references in docs over duplicating source; read code for implementation detail.
- If docs conflict with code or user intent, ask before making broad changes.

## Architecture

| File                               | Description                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| [architecture.md](architecture.md) | Module boundaries, scan→recommend→apply flow, update/install pipeline, output files |

## Codebase

| File                       | Description                                                              |
| -------------------------- | ------------------------------------------------------------------------ |
| [codebase.md](codebase.md) | Source tree inventory, entry points, wiring, where to change what, tests |

## Development workflow

| File             | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| [dev.md](dev.md) | Git hooks (Lefthook), test tiers, QA scripts, release process |

## CLI reference

| File             | Description                                                                            |
| ---------------- | -------------------------------------------------------------------------------------- |
| [cli.md](cli.md) | Full command surface: init, scan, recommend, apply, update, doctor, install, workspace |

## Other

| File                                           | Description                                             |
| ---------------------------------------------- | ------------------------------------------------------- |
| [security.md](security.md)                     | Guard commands, sensitive path rules, permissions model |
| [runbook.md](runbook.md)                       | Known failure modes with exact fix commands             |
| [deferred-decisions.md](deferred-decisions.md) | Open architectural questions deferred for later         |
