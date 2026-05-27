# haus

`haus` is a Haus-owned Claude Code workflow CLI.
It scans a repo, recommends stack-fit context assets, and writes controlled `.claude` + `.haus-workflow` outputs.

> **Internal Haus tool.** Open-source but unsupported for external use. No external issues, PRs, or roadmap commitments accepted.

- CLI: `haus`
- Runtime: Node `>=22`
- npm: `@haus-tech/haus-workflow`

## Quick start

```bash
npm install -g @haus-tech/haus-workflow
haus --version
```

Then, inside any project:

```bash
haus init
```

## Main commands

```bash
haus init              # first-run setup for new projects
haus setup-project     # reconfigure an existing setup
haus scan --json
haus recommend --json
haus apply --dry-run
haus apply --write
haus doctor
haus update --check
haus update
```

## Contributing

```bash
yarn install
yarn verify        # typecheck + typecheck:scripts + lint + build + test + prepack (incl. audit scripts)
```

See [Contributing](docs/contributing.md) for workflows (commands, scanner, catalog, skills, hooks, source decisions).

## Docs

- [User guide](docs/user-guide.md)
- [Architecture](docs/architecture.md)
- [Commands](docs/commands.md)
- [Technical guide](docs/technical-guide.md)
- [Dependencies policy](docs/dependencies.md)
- [Generated files](docs/generated-files.md)
- [Security](docs/security.md)
- [Memory](docs/memory.md)
- [Updates and lockfile](docs/updates.md)
- [Global install layout](docs/global-install.md)
- [Contributing](docs/contributing.md)
