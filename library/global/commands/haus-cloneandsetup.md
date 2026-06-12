Clone a project's repos **and** set each one up for local development — node version, dependencies, databases, cross-repo links, and env. This is `project:clone` followed by a per-repo setup pass and a localdev orchestration pass.

**Always ask before doing work — never assume.** Cloning and setup hit the network, need auth, and can touch databases; confirm before each phase, and respect repos the user already has.

## Step 1 — Clone

Run the full `project:clone` flow by following `~/.claude/commands/haus-clone.md` end to end (name → one repo; no name → workspace repos from `repos.manifest.json`). Carry the resulting repo list into Step 2.

## Step 2 — Confirm the setup pass

1. List the repos and what each will run (node, deps, localdev steps). Get a go-ahead. For **reused** local clones, ask whether to re-run setup.
2. Check `NODE_AUTH_TOKEN` is exported if any repo needs private `@`-scoped packages; if missing, tell the user — those installs fail without it.

## Step 3 — Per-repo dependency pass

For each repo, in its own directory, detect and install from the repo's own files (read its `docs/setup.md` / `CLAUDE.md` / `README.md` first — they win). Select node from `.nvmrc`/`engines.node` (`nvm install`), enable the pinned package manager (`corepack enable`), install JS deps (`yarn`/`pnpm`/`npm` by lockfile), composer deps if `composer.json` + `composer` present. Run each repo's steps in one login shell so the node version stays active. Per-repo failure is reported and skipped, not fatal.

## Step 4 — Local-dev orchestration

This is the phase that takes the workspace from "installed" to "ready to run." It is driven by `localdev.yml` files; a repo with none is set up by Step 3 only.

### House conventions (the "how", so repos specify only the "what")

Specify the least. Infer the rest from the repo's stack + these conventions, and work out the concrete commands at run time:

- **PHP / WordPress sites are served by the developer's own PHP environment — prefer [Laravel Herd](https://herd.laravel.com)** (docroot → the repo's `web/`, `herd secure` for HTTPS). **Do not install or script the PHP env**; just satisfy its env contract and report the URL. DDEV / Valet are fine if the dev already uses them.
- **Databases and other services (a repo's `needs:`) run in Docker.** Provision them the simplest way (a one-off `docker run`, or the repo's own compose if it ships one), then wire the matching env vars to point at them. Confirm before creating/overwriting data.
- **Dependencies** install from the lockfile (Step 3).
- A repo's `localdev.yml` carries **only what can't be inferred** — its `needs`, repo-specific `build`/`seed` commands, env keys, and URL. Detect the stack (e.g. Bedrock = `composer.json` + `web/` docroot + `wp-cli.yml`; Vendure/Node = `docker-compose.yml` + `@vendure/*`) and apply the matching convention.

### The `localdev.yml` format

**Per-repo — `<repo>/.haus-workflow/localdev.yml`** (how to set up THAT repo alone; sibling-agnostic):

All fields optional. **Prefer intent (`needs`/`build`/`seed`/`serve`) over explicit `steps`** —
the conventions above turn intent into commands.

```yaml
needs: [mysql] # services this repo requires; provisioned in Docker, env wired to them
needsEnv: [WP_HOME, DB_NAME] # env keys that must be present to run/serve
build: 'yarn build' # optional: the build command (run after deps)
seed: 'dep db:pull staging-oderland' # optional: how to load data; remote/destructive → confirm first
serve: # optional: how it runs (printed as a next-step, never auto-started)
  via: herd # herd | valet | docker | command — for PHP envs, bring-your-own (don't install)
  url: 'https://example.test'
  start: 'yarn dev'
steps: # optional escape hatch: explicit ordered shell steps when intent isn't enough
  - run: 'composer install'
    node: 10 # nvm version for THIS step
    remote: true # SSH → confirm first
    destructive: true # overwrites data → confirm first
    optional: true # failure is non-fatal, continue
```

**Workspace — `<workspace>/.haus-workflow/localdev.yml`** (the glue BETWEEN repos):

```yaml
order: [repo-a, repo-b] # setup/startup order, by manifest id
links:
  - { type: symlink, from: <repo-folder>, to: <repo-folder>/path/to/link }
  - { type: composer-path, in: <repo>, dep: <sibling-repo> }
  - { type: yarn-link, in: [<repo>, ...], dep: <sibling-package-repo> }
env:
  - source: { repo: <repo>, provides: '<value>' }
    sinks:
      - { repo: <repo>, key: ENV_KEY }
```

### Run order

1. **Discover** `.haus-workflow/localdev.yml` in the workspace root and each repo.
2. **Resolve order** from the workspace `order` (repos not listed run last, in manifest order). No workspace file → manifest order.
3. **Per repo, in order**, apply intent via the conventions:
   - **`needs`** → provision each service in Docker if not already running, and wire its env vars. Confirm before creating/overwriting data.
   - **`build`** → run it (honor any node version the repo's docs note).
   - **`serve`** → for `via: herd` / PHP envs, install nothing — verify the dev's environment serves `web/`, and report the URL.
   - **`seed`** → run it; **confirm first** if it's remote (SSH) or destructive (overwrites data).
   - **`steps`** (escape hatch) → run in order, selecting `node:` per step, `optional:` failures continue, **confirming before any `remote:`/`destructive:` step** — every run, even on re-run.
4. **Links** (workspace-owned, performed generically — do NOT call a repo's own `setup-dev-mode.sh`, which is deprecated):
   - `symlink` → `ln -s <from> <to>`; replace an existing symlink, but never clobber a real directory without confirmation.
   - `composer-path` → in `in`'s `composer.json`, set the `dep`'s require to `{ "type": "path", "url": "../<dep-folder>", "options": { "symlink": true } }`, then `composer update <vendor/dep>`.
   - `yarn-link` → `yarn link` in the `dep` repo, then `yarn link <pkg-name>` in each `in` repo (read `<pkg-name>` from the dep's `package.json`).
5. **Env:** for each workspace `env` entry, confirm the `source` is satisfiable, then upsert the value into each sink repo's `.env` under its `key`. **If the write is blocked or fails, print the exact `KEY=value` lines for the user to paste** (decision D5). Real secrets (DB passwords, tokens) remain the user's to fill.
6. **Report + next-steps.** Per-repo summary, then the ordered **start** commands from each repo's `serve.start` plus any manual follow-ups (e.g. `wp sync-products sync`).

**Stops at "ready to run," not "running" (D2):** bring up datastores (`docker compose up -d`), pull DBs, link, build, wire env — but do NOT start foreground dev servers or run the initial product sync. Print those.

## Step 5 — Report

Summarise per repo (node, deps, localdev steps, links, env). Then print, in order, the start commands and manual follow-ups. **Do not** run `yarn dev` / `docker compose up` (foreground) / `wp sync-products` — this command prepares, it does not run the app.
