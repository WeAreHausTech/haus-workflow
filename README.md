# @haus/ai

`@haus/ai` is a Haus-owned Claude Code workflow CLI + plugin package.
It scans a repo, recommends stack-fit context assets, and writes controlled `.claude` + `.haus-ai` outputs.

- CLI: `haus`
- Runtime: Node `>=22`
- Package manager: Yarn 4

## Quick start

```bash
yarn install
yarn build
node dist/cli.js setup-project
```

Or globally:

```bash
npm install -g @haus/ai
haus setup-project
```

## Main commands

```bash
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
yarn verify        # typecheck + lint + build + test + prepack — must pass before any PR
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
- [Plugin and skills](docs/plugin.md)
- [Contributing](docs/contributing.md)
