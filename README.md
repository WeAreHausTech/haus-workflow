# @haus/ai

`@haus/ai` is a Haus-owned Claude Code workflow CLI + plugin package.
It scans a repo, recommends stack-fit context assets, and writes controlled `.claude` + `.haus-ai` outputs.

- CLI: `haus`
- Runtime: Node `>=22`
- Package manager: Yarn 4

## Quick start

```bash
# Install globally
npm install -g @haus/ai

# First time in a project
haus init
```

Or without a global install:

```bash
yarn install
yarn build
node dist/cli.js init
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

## Claude Code plugin

Install the plugin once per machine via Claude Code's `/plugin` system:

```
/plugin marketplace add github:WeAreHausTech/haus-ai-workflow
/plugin install haus-ai@haus-marketplace
```

The plugin adds skills (e.g. `/haus-setup-project`) and hooks that inject Haus context automatically into each Claude session.
After installing the plugin, run `haus init` in each project to scan and generate recommendations, then `haus apply --write` to write `.claude/` files.

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
- [Plugin and skills](docs/plugin.md)
- [Contributing](docs/contributing.md)
