# haus

`haus` is a Haus-owned Claude Code workflow CLI + plugin package.
It scans a repo, recommends stack-fit context assets, and writes controlled `.claude` + `.haus-ai` outputs.

- CLI: `haus`
- Runtime: Node `>=22`
- Package manager: Yarn 4

## Quick start

`haus` is not published to npm. Install it from a local checkout of this repo.

**Primary: global link from checkout**

```bash
git clone https://github.com/WeAreHausTech/haus-ai-workflow.git
cd haus-ai-workflow
yarn install
yarn build
npm install -g .       # uses npm to symlink the `haus` bin into your global path
haus --version
```

**Alternative: install from a packed tarball**

```bash
yarn install
yarn build
yarn pack              # produces package.tgz
npm install -g ./package.tgz
```

**Without a global install** (run from the checkout directly):

```bash
yarn install
yarn build
node dist/cli.js init
```

**If you switch Node versions often (nvm / Herd / Volta):** `npm install -g .` only installs `haus` into the *currently active* Node version's bin. Either:

- reinstall whenever you change versions: `npm install -g .` (or `nvm install <ver> --reinstall-packages-from=current` when adding a new Node version), or
- add a shell alias that uses whatever Node is active — no per-version install needed:
  ```bash
  echo 'alias haus="node /absolute/path/to/haus-ai-workflow/dist/cli.js"' >> ~/.zshrc
  source ~/.zshrc
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

## Claude Code plugin

Install the plugin once per machine via Claude Code's `/plugin` system:

```
/plugin marketplace add WeAreHausTech/haus-ai-workflow
/plugin install haus-workflow@haus-marketplace
```

> **Note:** `WeAreHausTech/haus-ai-workflow` is a **private** GitHub repository. The `marketplace add` step requires authenticated git access on your machine (an SSH key with repo access, or `gh auth login` with the right scopes). Without auth, Claude Code will fail to fetch `.claude-plugin/marketplace.json` and the install won't proceed.

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
