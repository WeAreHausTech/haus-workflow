Clone a project's repos **and** set each one up for local development — node version, dependencies, databases, cross-repo links, and env. This is `project:clone` followed by a per-repo setup pass and a localdev orchestration pass.

**Always ask before doing work — never assume.** Cloning and setup hit the network, need auth, and can touch databases; confirm before each phase, and respect repos the user already has.

## Step 1 — Clone

Run the full `project:clone` flow by following `~/.claude/commands/haus-clone.md` end to end (name → one repo; no name → workspace repos from `repos.manifest.json`). Carry the resulting repo list into Step 2.

## Step 2 — Confirm the setup pass

1. List the repos and what each will run (node, deps, localdev steps). Get a go-ahead. For **reused** local clones, ask whether to re-run setup.
2. Check `NODE_AUTH_TOKEN` is exported if any repo needs private `@`-scoped packages; if missing, tell the user — those installs fail without it.

## Step 3 — Per-repo dependency pass

For each repo, in its own directory, detect and install from the repo's own files (read its `docs/setup.md` / `CLAUDE.md` / `README.md` first — they win). Select node from `.nvmrc`/`engines.node` (`nvm install`), enable the pinned package manager (`corepack enable`), install JS deps (`yarn`/`pnpm`/`npm` by lockfile), composer deps if `composer.json` + `composer` present. Run each repo's steps in one login shell so the node version stays active. Per-repo failure is reported and skipped, not fatal.

**Scaffold `.env`** so the env-wiring in Step 4 has a file to write to: if `.env.example` exists and `.env` does not, copy it; otherwise create an empty `.env`. Per decision D5, write `.env`; if the write is blocked, print the values for the user to add. Tell the user real secrets still need filling.

## Step 4 — Local-dev orchestration

This is the phase that takes the workspace from "installed" to "ready to run." It is driven by `localdev.yml` files; a repo with none is set up by Step 3 only.

### House conventions (the "how", so repos specify only the "what")

Specify the least. Infer the rest from the repo's stack + these conventions, and work out the concrete commands at run time:

- **IMPORTANT — never install anything without asking first; global/system tools especially** (Homebrew, Docker, Laravel Herd, global `npm`/`composer` packages). Detect what's already present; if something required is missing, name it, say why it's needed, and get an explicit **yes** before installing. Prefer the least-invasive option, and don't switch or override tools the dev already has.
- **PHP / WordPress sites are served by the developer's own PHP environment.** If they already have one — detect `valet`, `herd`, `ddev`, or `php` on PATH — **use it**: just satisfy the env contract (docroot → the repo's `web/`, HTTPS) and report the URL; never override what they already run. **Only when no local PHP environment exists** (a completely fresh machine) suggest installing **[Laravel Herd](https://herd.laravel.com)** as the default (asking first) and point its docroot at `web/` + `herd secure`.
- **Databases and other services (a repo's `needs:`) run in Docker.** **If Docker isn't installed**, it's a prerequisite for these — tell the user and **ask before installing it** (it's a global install). Once Docker is available, provision services the simplest way (a one-off `docker run`, or the repo's own compose if it ships one), then wire the matching env vars to point at them. Confirm before creating/overwriting data.
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
5. **Env:** for each workspace `env` entry, confirm the `source` is satisfiable, then upsert the value into each sink repo's `.env` under its `key` — **creating `.env` if it does not exist** (Step 3 scaffolds it, but don't assume). **If the write is blocked or fails, print the exact `KEY=value` lines for the user to paste** (decision D5). Real secrets (DB passwords, tokens) remain the user's to fill.
6. **Report, then offer to start.** Give the per-repo summary, then **ask the user whether to start everything now.**
   - **Yes** → start each repo in the workspace `order` (its `serve.start`, e.g. `yarn dev`; bring up any remaining foreground services), run any follow-ups (e.g. `wp sync-products sync`), then **print the live URLs** (each repo's `serve.url`).
   - **No** → just print the ordered start commands + follow-ups as next steps; start nothing.

**Default is "ready to run" (D2):** the preparation — datastores up (`docker compose up -d`), DBs pulled, links, builds, env wired — always happens. Starting the **foreground** dev servers and the initial product sync happens **only if the user says yes** to the start prompt above; otherwise they're printed, not run.

## Step 5 — Report

Summarise per repo (node, deps, localdev steps, links, env). Then **ask whether to start everything now**:

- **Yes** → start the dev servers in workspace `order`, run any follow-ups, and **print the live URLs** so the user can open the running app.
- **No** → print the ordered start commands + follow-ups instead, and start nothing.

Never start the app without that explicit yes.
