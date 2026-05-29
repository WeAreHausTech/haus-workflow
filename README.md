# haus

CLI that scans a project, recommends AI context assets for the stack, and writes controlled outputs into `.claude/` and `.haus-workflow/`.

> **Internal Haus tool.**

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
haus update            # sync remote catalog + refresh lockfile
haus update --check    # check for updates without applying
haus doctor            # health check: hooks, CLAUDE.md, catalog cache
haus config            # manage hook configuration
haus memory            # view project memory store
haus guard             # test bash/file-access guards
haus uninstall         # remove Haus-managed files from ~/.claude/
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
