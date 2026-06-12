# Haus Workflow

> Internal Haus tool. Open-source but unsupported for external use. No external issues, PRs, or roadmap commitments accepted.

---

## Install

Requires Node 22+.

```bash
npm install -g @haus-tech/haus-workflow
```

A **global** install auto-runs `haus install` via a postinstall hook — it seeds
`~/.claude/` with Haus-managed skills, global slash commands, and hooks, merges
security rules into `~/.claude/settings.json`, and prints a notice of what changed.
It is non-fatal, idempotent, and global-only. Skip it with `HAUS_NO_POSTINSTALL=1`;
re-run or repair any time with `haus install`. Undo with `haus uninstall`.

**Driving it from Claude Code (no terminal):** once installed, every project's `/`
menu has `/haus-setup`, `/haus-doctor`, and `/haus-fix`. Run `/haus-setup` (or just
ask "set up my project") and the agent scans, explains what it found in plain
language, and configures the repo for you.

---

## haus-workflow skill

Once installed, Claude Code gains a `/haus-workflow` slash command.

The `project:*` tasks act on the current repo. The unprefixed verbs (`update`,
`catalog`, `install`, `uninstall`) manage the haus tool itself on your machine
(`~/.claude` + npm), like `npm install -g`. The short legacy names still work.

```
/haus-workflow                              # interactive menu — pick a task
/haus-workflow project:init                 # [project] add haus to an EXISTING repo — AI skills, commands, workflow + docs
/haus-workflow project:clone [name]         # [project] clone a workspace's repos (repos.manifest.json), or find & clone one repo by name from GitHub
/haus-workflow project:cloneandsetup [name] # [project] like project:clone, then set up each repo locally (node version, deps, .env)
/haus-workflow project:refresh              # [project] refresh .claude/ and regenerate CLAUDE.md imports
/haus-workflow project:doctor               # [project] health check for drift
/haus-workflow update                       # [global]  update npm package + catalog + ~/.claude/
/haus-workflow catalog                      # [global]  fetch only the latest catalog
```

Without an argument, the skill presents a menu so you can pick the task. With an argument, it runs immediately.

---

## Per-project setup

Run once inside each project:

```bash
haus init
```

Scans the repo, recommends context assets, and writes `.claude/` and `.haus-workflow/`.

---

## Commands

```bash
haus init              # first-run setup (scan → recommend → apply)
haus setup-project     # re-run setup on existing project
haus clone <url> [dir] # clone a single git repo by URL (the primitive project:clone / project:cloneandsetup loop over)
haus scan              # scan repo and write context-map
haus recommend         # recommend catalog items (binary eligibility)
haus apply --dry-run   # preview what would be written
haus apply --write     # write .claude/ files (skills, agents, commands, templates)
haus apply --select    # interactively choose which recommended items to install
haus apply --refill-config    # fill still-blank workflow-config.md fields, keep edits
haus context --task "<task>"  # select context rules for a task (token-budgeted)
haus update                   # sync remote catalog + re-apply project files
haus update --check           # check for updates without applying
haus undo                     # remove haus-managed project files (lock-tracked paths)
haus doctor                   # health check: hooks, CLAUDE.md, imports, catalog cache
haus config                   # manage hook configuration
haus guard                    # test bash/file-access guards
haus uninstall                # remove Haus-managed files from ~/.claude/
```

> Cross-session learnings use Claude Code's **native memory** (`MEMORY.md`); haus
> ships no memory store — see the `haus.memory-conventions` catalog doc.

---

## Development

```bash
yarn install
yarn verify   # typecheck + lint + build + test
yarn dev <cmd>  # run CLI without building (tsx)
```

### Catalog

Content lives in [`haus-workflow-catalog`](https://github.com/WeAreHausTech/haus-workflow-catalog)
(71 items; version pinned in `library/catalog/manifest.json`). Fetched at runtime from `main` (override with `HAUS_CATALOG_REF`).
Validation rules sync from catalog → `library/catalog/validation-rules.json` (ADR-0001).

On `haus apply` / `haus update`, items **removed from the catalog** are pruned from the
project when their on-disk copy still matches the lock hash; user-edited copies are kept.

### Internal docs

- [Architecture](docs/architecture.md)
- [CLI reference](docs/cli.md)
- [Security](docs/security.md)
- [Developer scripts](docs/dev.md)
- [Runbook](docs/runbook.md)
