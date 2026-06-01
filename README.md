# Haus Workflow

> Internal Haus tool. Open-source but unsupported for external use. No external issues, PRs, or roadmap commitments accepted.

---

## Install

Requires Node 22+.

```bash
npm install -g @haus-tech/haus-workflow
haus install
```

`haus install` seeds `~/.claude/` with Haus-managed skills, agents, and hooks.

**Prefer Claude over the terminal?** Paste this prompt into a Claude Code session:

```
Install the haus-workflow CLI globally and run haus install to seed ~/.claude/ with the Haus skills and hooks.

Steps:
1. Run: npm install -g @haus-tech/haus-workflow
2. Run: haus install
3. Confirm which files were written to ~/.claude/
```

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
haus recommend         # score and recommend catalog items
haus apply --dry-run   # preview what would be written
haus apply --write     # write .claude/ files
haus context --task "<task>"  # select context rules for a specific task
haus update                   # sync remote catalog + refresh lockfile
haus update --check           # check for updates without applying
haus undo                     # undo last applied changes
haus doctor                   # health check: hooks, CLAUDE.md, catalog cache
haus config                   # manage hook configuration
haus memory                   # view project memory store
haus guard                    # test bash/file-access guards
haus uninstall                # remove Haus-managed files from ~/.claude/
```

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
