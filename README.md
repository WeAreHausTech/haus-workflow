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
ask "set up my project") and the agent scans, asks a few plain-language questions,
and configures the repo for you.

---

## haus-workflow skill

Once installed, Claude Code gains a `/haus-workflow` slash command.

```
/haus-workflow          # interactive menu — pick setup, update, refresh, etc.
/haus-workflow init     # first-time project setup
/haus-workflow apply    # refresh .claude/ and regenerate CLAUDE.md imports
/haus-workflow update   # update npm package + catalog + ~/.claude/
/haus-workflow catalog  # fetch only latest catalog
/haus-workflow doctor   # health check for drift
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
haus scan              # scan repo and write context-map
haus recommend         # recommend catalog items (binary eligibility)
haus apply --dry-run   # preview what would be written
haus apply --write     # write .claude/ files
haus apply --refill-config    # fill still-blank workflow-config.md fields, keep edits
haus context --task "<task>"  # select context rules for a task (token-budgeted)
haus update                   # sync remote catalog + refresh lockfile
haus update --check           # check for updates without applying
haus undo                     # undo last applied changes
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

### Internal docs

- [Architecture](docs/architecture.md)
- [CLI reference](docs/cli.md)
- [Security](docs/security.md)
- [Developer scripts](docs/dev.md)
