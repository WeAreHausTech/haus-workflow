Clone a project's repos **and** set each one up for local development — node version, dependencies, databases, cross-repo links, and env. This is `project:clone` followed by a per-repo setup pass and a localdev orchestration pass.

**Always ask before doing work — never assume.** Cloning and setup hit the network, need auth, and can touch databases; confirm before each phase, and respect repos the user already has.

## Step 1 — Clone

Run the full `project:clone` flow by following `~/.claude/commands/haus-clone.md` end to end (name → one repo; no name → workspace repos from `repos.manifest.json`). Carry the resulting repo list into Step 2.

## Step 2 — Prerequisite gate (one consolidated check)

Before any setup work, probe **everything** the workspace will need and surface **all** gaps in a single prompt — never discover them piecemeal mid-flow. For the repos being set up, check:

- **Auth tokens** — `NODE_AUTH_TOKEN` exported (private `@`-scoped npm packages fail without it); `~/.composer/auth.json` (or a repo-local `auth.json`) present if any repo has private composer deps.
- **Docker daemon** — running (`docker info`); required for any repo's `needs:` services.
- **PHP environment** — `valet`, `herd`, `ddev`, or `php` on PATH, if any repo is a PHP/WordPress site.
- **WP-CLI** — `wp --version`, if any repo's `seed:` pulls a WordPress DB.
- **Node versions** — the versions named in each repo's `.nvmrc` / `engines.node` are installable via `nvm`.

Then list the repos and what each will run (node, deps, localdev steps), **report every gap at once**, and get a single go-ahead. For **reused** local clones, ask whether to re-run setup. For each gap, name what it blocks; the user decides whether to fix it now (**ask before any global/system install**) or proceed and skip the affected steps. Don't begin per-repo work until this gate is acknowledged.

## Step 3 — Per-repo dependency pass

For each repo, in its own directory, detect and install from the repo's own files (read its `docs/setup.md` / `CLAUDE.md` / `README.md` first — they win). Select node from `.nvmrc`/`engines.node` (`nvm install`), enable the pinned package manager (`corepack enable`), install JS deps (`yarn`/`pnpm`/`npm` by lockfile), composer deps if `composer.json` + `composer` present. Run each repo's steps in one login shell so the node version stays active. Per-repo failure is reported and skipped, not fatal.

**Leave `.env` to Step 4 → "Env".** The dependency pass installs only; the env phase writes each repo's `.env` deterministically once services, links, and values are in place.

## Step 4 — Local-dev orchestration

This is the phase that takes the workspace from "installed" to "ready to run." It is driven by `localdev.yml` files; a repo with none is set up by Step 3 only.

### House conventions (the "how", so repos specify only the "what")

Specify the least. Infer the rest from the repo's stack + these conventions, and work out the concrete commands at run time:

- **IMPORTANT — never install anything without asking first; global/system tools especially** (Homebrew, Docker, Laravel Herd, global `npm`/`composer` packages). Detect what's already present; if something required is missing, name it, say why it's needed, and get an explicit **yes** before installing. Prefer the least-invasive option, and don't switch or override tools the dev already has.
- **PHP / WordPress sites are served by the developer's own PHP environment.** If they already have one — detect `valet`, `herd`, `ddev`, or `php` on PATH — **use it**: just satisfy the env contract (docroot → the repo's `web/`, HTTPS) and report the URL; never override what they already run. **Only when no local PHP environment exists** (a completely fresh machine) suggest installing **[Laravel Herd](https://herd.laravel.com)** as the default (asking first) and point its docroot at `web/` + `herd secure`.
- **Databases and other services (a repo's `needs:`) run in Docker as standalone containers.** Bring each up with a **clean `docker run`** — image, host port, and env from the house convention for that service (e.g. `mysql` → `mysql:8` on `127.0.0.1:3306`, root password from generated secrets; `postgres` → `postgres:16` on `5432`). **Do not provision a `needs:` service from the repo's own `docker-compose.yml` when that compose bind-mounts repo-relative init files** (e.g. `./seed.sql`, `./docker-entrypoint-initdb.d/`): those mounts need files the guard won't let us create, and they conflate bring-up with seeding (which is the separate `seed:` step). **If Docker isn't installed** it's a prerequisite (surfaced in the Step 2 gate) — **ask before installing it** (global install). **Port-conflict caveat:** if the conventional host port is already taken, pick the next free port, use it, and **record the chosen port in the workspace `localdev.yml` `env` map** so sink repos point at the right place. A `needs:` service comes up **empty** — populating it is always the separate `seed:` step.
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

The workspace `env` map is the **single source of truth for cross-repo values** — DB names, ports, host URLs are chosen once and recorded here as literals. The env phase reads values **from here** and writes them into each repo's `.env`. Recording them here (not only in a repo's `.env`) means a later `seed:` / `db:pull` step can find them without depending on env-file load order.

```yaml
order: [repo-a, repo-b] # setup/startup order, by manifest id
links:
  - { type: symlink, from: <repo-folder>, to: <repo-folder>/path/to/link }
  - { type: composer-path, in: <repo>, dep: <sibling-repo> }
  - { type: yarn-link, in: [<repo>, ...], dep: <sibling-package-repo> }
env:
  - value: 'app_local' # a chosen literal — the recorded source of truth, OR …
    # source: { repo: <repo>, provides: '<value>' }   # … a value produced by another repo
    sinks:
      - { repo: <repo>, key: DB_NAME } # written under `key` into each sink's .env
```

### Run order

1. **Discover** `.haus-workflow/localdev.yml` in the workspace root and each repo.
2. **Resolve order** from the workspace `order` (repos not listed run last, in manifest order). No workspace file → manifest order.
3. **Per repo, in order**, apply intent via the conventions:
   - **`needs`** → bring up each service as a **standalone `docker run`** (image/port/env from conventions; **not** the repo's compose when it bind-mounts repo-relative init files) if not already running. The service comes up **empty**; record its values in the workspace `localdev.yml` `env` map. No data is created here, so no overwrite prompt at this step — data lands in `seed:`.
   - **`build`** → run it (honor any node version the repo's docs note).
   - **`serve`** → for `via: herd` / PHP envs, install nothing — verify the dev's environment serves `web/`, and report the URL.
   - **`seed`** → populate the empty datastore. **Always a distinct, confirm-gated step, separate from `needs:` bring-up** (don't conflate "DB up" with "DB has data"). Before running, **check its prerequisites and report any gap instead of running blind** — e.g. WP-CLI present (for `wp` / `db:pull` seeds), the target repo's **`.env` written** (the seed reads connection values from it — done in the Env step above), the **SSH alias resolves** (for remote pulls like `dep db:pull staging-oderland`). **Confirm first** for every remote (SSH) or destructive (overwrites data) seed — every run, even on re-run. Missing prerequisite → skip with a clear message, don't guess.
   - **`steps`** (escape hatch) → run in order, selecting `node:` per step, `optional:` failures continue, **confirming before any `remote:`/`destructive:` step** — every run, even on re-run.
4. **Links** (workspace-owned, performed generically — do NOT call a repo's own `setup-dev-mode.sh`, which is deprecated):
   - `symlink` → `ln -s <from> <to>`; replace an existing symlink, but never clobber a real directory without confirmation.
   - `composer-path` → in `in`'s `composer.json`, set the `dep`'s require to `{ "type": "path", "url": "../<dep-folder>", "options": { "symlink": true } }`, then `composer update <vendor/dep>`.
   - `yarn-link` → `yarn link` in the `dep` repo, then `yarn link <pkg-name>` in each `in` repo (read `<pkg-name>` from the dep's `package.json`).
5. **Env (deterministic):** write each repo's `.env` from known values — no improvising.
   1. **Compute** each repo's values, in this precedence: the workspace `localdev.yml` `env` map (chosen literals + cross-repo `source` values — the single source of truth) → generated secrets (DB passwords/tokens minted this run) → the **dev-defaults table** below for anything still unset.
   2. **Write** them into each repo's `.env` (create it if absent; **upsert** keys, never clobbering a value the user already set). These are local dev files — write them directly.
   3. **Real secrets the generator can't mint** (third-party API keys, prod credentials) go in as clearly-marked `KEY=` blanks for the user to fill; report exactly which keys are still blank.

   **Dev-defaults table** — used only when neither `localdev.yml` nor a generated secret supplies the value:

   | Key                              | Default                                                             |
   | -------------------------------- | ------------------------------------------------------------------- |
   | `DB_HOST`                        | `127.0.0.1`                                                         |
   | `DB_PORT`                        | `3306` (mysql) / `5432` (postgres) — or the port chosen on conflict |
   | `DB_USER` / `DB_PASSWORD`        | `root` / a generated secret                                         |
   | `WP_HOME`, `WP_SITEURL`, `*_URL` | the repo's `serve.url`                                              |
   | `WP_ENV` / `APP_ENV`             | `development`                                                       |

6. **Report, then offer to start.** Give the per-repo summary, then **ask the user whether to start everything now.**
   - **Yes** → start each repo in the workspace `order` (its `serve.start`, e.g. `yarn dev`; bring up any remaining foreground services), run any follow-ups (e.g. `wp sync-products sync`), then **print the live URLs** (each repo's `serve.url`).
   - **No** → just print the ordered start commands + follow-ups as next steps; start nothing.

**Default is "ready to run" (D2):** the preparation — datastores up (standalone `docker run`), seeds applied (confirm-gated), links, builds, each repo's `.env` written — always happens. Starting the **foreground** dev servers and the initial product sync happen **only if the user says yes** to the start prompt above; otherwise they're printed, not run.

## Step 5 — Report and define "done"

**"Done" is an explicit terminal state**, not "looks set up". The preparation reaches:

- datastores up (standalone containers),
- dependencies installed and builds green,
- links wired,
- each repo's `.env` written from known values.

From there, **live URLs are reachable only if** every required secret is satisfiable **and** the user starts the servers. If a secret can't be minted (a third-party key, a prod credential), say exactly which keys are still blank and what the user must fill — don't imply links a missing secret will quietly break.

Summarise per repo (node, deps, localdev steps, links, env). Then **ask whether to start everything now**:

- **Yes** → start the dev servers in workspace `order`, run any follow-ups, and **print the live URLs** so the user can open the running app.
- **No** → print the ordered start commands + follow-ups instead, and start nothing.

Never start the app without that explicit yes.
