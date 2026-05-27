# haus

Claude Code workflow CLI for Haus projects. Scans a repo, recommends stack-fit context assets, and writes controlled `.claude/` and `.haus-workflow/` outputs so Claude works with safer, stack-aware guidance.

> **Internal Haus tool.** Open-source but unsupported for external use.

---

## Install

Requires Node 22+.

```bash
npm install -g @haus-tech/haus-workflow
haus install
```

`haus install` seeds `~/.claude/` with Haus-managed skills, agents, and hooks.

---

## Per-project setup

Run once inside each project:

```bash
haus init
```

This scans the repo, recommends context assets, and writes `.claude/` and `.haus-workflow/`.

---

## Commands

```bash
haus init              # first-run setup (scan → recommend → apply)
haus setup-project     # re-run setup on an existing project
haus apply --dry-run   # preview what would be written
haus apply --write     # write .claude/ files
haus update            # sync remote catalog + refresh lockfile
haus update --check    # check for updates without applying
haus doctor            # health check: hooks, CLAUDE.md, catalog cache
haus uninstall         # remove Haus-managed files from ~/.claude/
```

---

## Contributing

```bash
yarn install
yarn verify   # typecheck + lint + build + test
```

See [docs/contributing.md](docs/contributing.md).

---

## Docs

- [User guide](docs/user-guide.md)
- [Architecture](docs/architecture.md)
- [Commands](docs/commands.md)
- [Global install layout](docs/global-install.md)
- [Generated files](docs/generated-files.md)
- [Updates and lockfile](docs/updates.md)
- [Security](docs/security.md)
- [Memory](docs/memory.md)
