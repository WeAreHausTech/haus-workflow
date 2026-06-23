# Haus Workflow

> Internal Haus tool. Open-source but unsupported for external use. No external issues, PRs, or roadmap commitments accepted.

---

## Install

Requires Node 22+.

**Terminal:**

```bash
npm install -g @haus-tech/haus-workflow
```

**Or paste this into Claude Code:**

```
Install the haus-workflow CLI globally by running `npm install -g @haus-tech/haus-workflow`.
```

A **global** install auto-runs `haus install` via a postinstall hook — it seeds
`~/.claude/` with Haus-managed skills, global slash commands, and hooks, merges
security rules into `~/.claude/settings.json`, and prints a notice of what changed.
It is non-fatal, idempotent, and global-only. Skip it with `HAUS_NO_POSTINSTALL=1`;
re-run or repair any time with `haus install`. Undo with `haus uninstall`.

---

## haus-workflow skill

Once installed, Claude Code gains a `/haus-workflow` slash command.

The `project:*` tasks act on the current repo. The unprefixed verbs (`update`,
`install`, `uninstall`) manage the haus tool itself on your machine
(`~/.claude` + npm), like `npm install -g`. The short legacy names still work.

```
/haus-workflow                              # interactive menu — pick a task
/haus-workflow project:init                 # [project] add haus to an EXISTING repo — AI skills, commands, workflow + docs
/haus-workflow project:clone [name]         # [project] clone a workspace's repos (repos.manifest.json), or find & clone one repo by name from GitHub
/haus-workflow project:cloneandsetup [name] # [project] like project:clone, then set up each repo locally (node version, deps, .env)
/haus-workflow project:refresh              # [project] refresh .claude/ and regenerate CLAUDE.md imports
/haus-workflow project:doctor               # [project] health check for drift
/haus-workflow update                       # [global]  update npm package + catalog + ~/.claude/
```

Without an argument, the skill presents a menu so you can pick the task. With an argument, it runs immediately.

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
haus update                   # check npm for new CLI + sync catalog + refresh ~/.claude/ and this project
haus update --check           # check for updates without applying
haus undo                     # remove haus-managed project files (lock-tracked paths)
haus doctor                   # health check: hooks, CLAUDE.md, imports, catalog cache
haus guard bash|file-access   # security guard hook; invoked by PreToolUse
haus workspace                # multi-repo ops: discover, scan, setup, doctor across a workspace
haus uninstall                # remove Haus-managed files from ~/.claude/
```

> Cross-session learnings use Claude Code's **native memory** (`MEMORY.md`); haus
> ships no memory store.

---

## Catalog

Content lives in [`haus-workflow-catalog`](https://github.com/WeAreHausTech/haus-workflow-catalog)
(version pinned in `library/catalog/manifest.json`). Fetched at runtime from the latest release tag (override with `HAUS_CATALOG_REF`; fallback `main` when no release tag resolves).
Validation rules sync from catalog → `library/catalog/validation-rules.json` (ADR-0001).

On `haus apply` / `haus update`, items **removed from the catalog** or marked
**deprecated** are pruned from the project when their on-disk copy still matches the
lock hash; user-edited copies are kept. Approved items deselected via `--select` are
not pruned.

> **Upgrading from a pre-`0.30.0` CLI:** deprecated-skill pruning shipped in `0.30.0`.
> If an older CLI left deprecated skills on disk, upgrade first
> (`npm i -g @haus-tech/haus-workflow`) then run `haus update` to prune them.

## Internal docs

[docs/SUMMARY.md](docs/SUMMARY.md) — full documentation index

- [Architecture](docs/architecture.md)
- [Codebase](docs/codebase.md)
- [CLI reference](docs/cli.md)
- [Developer scripts & release](docs/dev.md)
- [Security](docs/security.md)
- [Runbook](docs/runbook.md)
