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
- **Data-access preflight** — for every data load the workspace will run (each repo's `seed` **and** the workspace `seeds`), check up front that the user can actually reach the source, so nobody ends up with a half-set-up environment that only fails at the seed step. See below.

### Data-access preflight

The single most common way cloneAndSetup leaves a **half-completed environment** is discovering at the `seed:` step — after cloning, installing, and bringing up services — that the user lacks the AWS/SSH/etc. access to pull the data. Catch it **here**, before any heavy work, and make the data outcome a deliberate choice.

1. **Collect every seed:** each repo's `seed` plus the workspace `seeds`. For each, determine its required access:
   - If `seed` is an **object with `access`**, run each entry's `check` (a read-only probe; exit 0 = reachable).
   - If `seed` is a **bare string**, infer the channel and probe generically: `aws …`/SSM → `aws sts get-caller-identity`; `dep db:pull …` / `ssh`/`scp`/`rsync <user@host>` → `ssh -o BatchMode=yes -o ConnectTimeout=5 <host> true`; `northflank …` → `northflank whoami`. A purely local seed (no remote) needs nothing.
2. **Report one table** alongside the rest of the gate — per data source: its `label`, the access it needs, and ✓ reachable / ✗ + the `login` remedy (verbatim).
3. **Resolve every ✗ with one consolidated choice**, then remember it for the run:
   - **Set up access now** → print the `login` text, let the user do it, **re-check**, then seed normally.
   - **Create that DB EMPTY for now** (only when `empty-ok` is true — the default) → the datastore comes up empty (schema via migrations/`needs:`), the app still boots, and the user can run that one seed later. Name the exact command to fill it.
   - **Abort.**
4. **Only a gap on a seed with `empty-ok: false` is a HARD STOP** (the repo is genuinely broken without data — log in or abort). Every other gap offers the empty path; one source's missing access never blocks another's.

This is the one prompt the "no half-completed environment" goal justifies. The two valid end-states are **seeded** or **deliberately empty** — never a third "did the expensive work then died at seed."

Then list the repos and what each will run (node, deps, localdev steps, **data sources + the chosen seed/empty plan**), **report every gap at once**, and get a single go-ahead. For **reused** local clones, ask whether to re-run setup. For each gap, name what it blocks; the user decides whether to fix it now (**ask before any global/system install**) or proceed and skip the affected steps. Don't begin per-repo work until this gate is acknowledged.

## Step 3 — Per-repo dependency pass

For each repo, in its own directory, detect and install from the repo's own files (read its `docs/setup.md` / `CLAUDE.md` / `README.md` first — they win). Select node from `.nvmrc`/`engines.node` (`nvm install`), enable the pinned package manager (`corepack enable`), install JS deps (`yarn`/`pnpm`/`npm` by lockfile), composer deps if `composer.json` + `composer` present. Run each repo's steps in one login shell so the node version stays active. Per-repo failure is reported and skipped, not fatal.

**Leave `.env` to Step 4 → "Env".** The dependency pass installs only; the env phase writes each repo's `.env` deterministically once services, links, and values are in place.

## Step 4 — Local-dev orchestration

This is the phase that takes the workspace from "installed" to "ready to run." It is driven by `localdev.yml` files; a repo with none is set up by Step 3 only.

### House conventions (the "how", so repos specify only the "what")

Specify the least. Infer the rest from the repo's stack + these conventions, and work out the concrete commands at run time:

- **IMPORTANT — never install anything without asking first; global/system tools especially** (Homebrew, Docker, Laravel Herd, global `npm`/`composer` packages). Detect what's already present; if something required is missing, name it, say why it's needed, and get an explicit **yes** before installing. Prefer the least-invasive option, and don't switch or override tools the dev already has.
- **PHP / WordPress sites are served by the developer's own PHP environment.** If they already have one — detect `valet`, `herd`, `ddev`, or `php` on PATH — **use it**: just satisfy the env contract (docroot → the repo's `web/`, HTTPS) and report the URL; never override what they already run. **Only when no local PHP environment exists** (a completely fresh machine) suggest installing **[Laravel Herd](https://herd.laravel.com)** as the default (asking first) and point its docroot at `web/` + `herd secure`.
- **Databases and other services (a repo's `needs:`) run in Docker as a shared, workspace-owned `docker-compose` project** — grouped and self-contained (`up`/`down` together, named volumes), namespaced per workspace instance via `COMPOSE_PROJECT_NAME` + its own host ports so the workspace can run multiple times side by side. Image/port/env per the house convention (`mysql:8`, `postgres:16`, …). Don't reuse a repo's own compose that bind-mounts repo-relative init files (`seed.sql`) — author the service in the workspace compose. Services come up **empty** (seeding is the separate `seed:` step); record chosen host ports in the workspace `localdev.yml` `env` map.
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
# `seed` may also be an OBJECT when the load needs external access (AWS, SSH, …) so the
# Step-2 data-access preflight can check it up front and offer an empty-DB fallback:
seed:
  run: './scripts/pull-aws-db.sh --yes' # the seed command
  empty-ok: true # default true: skipping yields a coherent EMPTY DB (schema via migrations).
  #              # false = the repo is broken without data → a missing-access gap HARD-STOPS.
  access: # what the user must have to run `run`; each entry probed in the Step-2 preflight
    - label: 'AWS CLI credentials — eu-north-1 / 842675986884'
      check: 'aws sts get-caller-identity --region eu-north-1' # read-only probe; exit 0 = OK
      login: 'Set up the AWS CLI (brew install awscli; aws configure …) — or pick empty DB.'
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
seeds: # optional: data sources NOT owned by a manifest repo (e.g. a shared WordPress host
  #    pulled by a workspace script). Same shape as a per-repo `seed` object; included in
  #    the Step-2 data-access preflight.
  - label: 'WordPress host (example.se)'
    run: './scripts/pull-wp-example.sh'
    empty-ok: true
    access:
      - label: 'SSH user@host'
        check: 'ssh -o BatchMode=yes -o ConnectTimeout=5 user@host true'
        login: 'Add your SSH key to the host (ssh-add …) / request access — or skip the pull.'
```

### Run order

1. **Discover** `.haus-workflow/localdev.yml` in the workspace root and each repo.
2. **Resolve order** from the workspace `order` (repos not listed run last, in manifest order). No workspace file → manifest order.
3. **Per repo, in order**, apply intent via the conventions:
   - **`needs`** → add the service to the **workspace compose project** and `docker compose up -d` if not already running (namespaced by `COMPOSE_PROJECT_NAME`, free host ports per instance; not the repo's own bind-mounting compose). Comes up **empty**; record host ports in the workspace `localdev.yml` `env` map — data lands in `seed:`.
   - **`build`** → run it (honor any node version the repo's docs note).
   - **`serve`** → for `via: herd` / PHP envs, install nothing — verify the dev's environment serves `web/`, and report the URL.
   - **`seed`** → populate the empty datastore (`seed.run`, or the bare-string form). **Always a distinct, confirm-gated step, separate from `needs:` bring-up** (don't conflate "DB up" with "DB has data"). **Honor the data plan chosen in the Step-2 data-access preflight** — don't re-discover access here: if the user chose _empty_ for this source, skip it (the DB stays empty, schema via migrations) and print the command to fill it later; if they chose _seed_, run it. Still verify the run-time prerequisites the preflight couldn't (the target repo's **`.env` written** — done in the Env step above; WP-CLI present for `wp`/`db:pull` seeds) and **confirm first** for every remote (SSH/AWS) or destructive (overwrites data) seed — every run, even on re-run. Missing prerequisite → skip with a clear message, don't guess.
   - **`steps`** (escape hatch) → run in order, selecting `node:` per step, `optional:` failures continue, **confirming before any `remote:`/`destructive:` step** — every run, even on re-run.
4. **Links** (workspace-owned, performed generically — do NOT call a repo's own `setup-dev-mode.sh`, which is deprecated):
   - `symlink` → `ln -s <from> <to>`; replace an existing symlink, but never clobber a real directory without confirmation.
   - `composer-path` → in `in`'s `composer.json`, set the `dep`'s require to `{ "type": "path", "url": "../<dep-folder>", "options": { "symlink": true } }`, then `composer update <vendor/dep>`.
   - `yarn-link` → `yarn link` in the `dep` repo, then `yarn link <pkg-name>` in each `in` repo (read `<pkg-name>` from the dep's `package.json`).
5. **Env (deterministic):** write each repo's `.env` from known values — no improvising.
   1. **Compute** each repo's values, in this precedence: the workspace `localdev.yml` `env` map (chosen literals + cross-repo `source` values — the single source of truth) → generated secrets (DB passwords/tokens minted this run) → **a value already present locally** in a sibling repo's `.env.example` / `.env` (matched by key, or by the same value under a framework-prefix swap `MIX_` ↔ `VITE_` ↔ `NEXT_PUBLIC_` ↔ `REACT_APP_`) — reuse it: it is already on the machine, so copying it into this repo's local (gitignored) `.env` adds nothing new to git → the **dev-defaults table** below for anything still unset.
   2. **Write** them into each repo's `.env` (create it if absent; **upsert** keys, never clobbering a value the user already set). These are local dev files — write them directly.
   3. **Secrets that exist nowhere locally** (third-party API keys, prod credentials, license keys the machine doesn't already have — reuse from §1 only applies when the value is present locally) go in as clearly-marked `KEY=` blanks for the user to fill, and the flow **instructs rather than guesses**: for each, name **which key**, **what it unlocks** (the step or feature that fails without it), and **where to obtain it**. **NEVER write a secret value into a git-tracked file:** `.env` writes are local and gitignored (fine — reuse freely), but the workspace `localdev.yml` `env` map is committed, so it carries non-secret cross-repo literals only (DB names, ports, host URLs), never credentials. Report all blanks together as one actionable list, not piecemeal.

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

**Default is "ready to run" (D2):** the preparation — datastores up (workspace `docker compose` project), seeds applied (confirm-gated), links, builds, each repo's `.env` written — always happens. Starting the **foreground** dev servers and the initial product sync happen **only if the user says yes** to the start prompt above; otherwise they're printed, not run.

## Step 5 — Report and define "done"

**"Done" is an explicit terminal state**, not "looks set up". The preparation reaches:

- datastores up (workspace `docker compose` project),
- dependencies installed and builds green,
- links wired,
- each repo's `.env` written from known values.

From there, **live URLs are reachable only if** every required secret is satisfiable **and** the user starts the servers. If a secret can't be minted (a third-party key, a prod credential), say exactly which keys are still blank and what the user must fill — don't imply links a missing secret will quietly break.

Summarise per repo (node, deps, localdev steps, links, env). Then **ask whether to start everything now**:

- **Yes** → start the dev servers in workspace `order`, run any follow-ups, and **print the live URLs** so the user can open the running app.
- **No** → print the ordered start commands + follow-ups instead, and start nothing.

Never start the app without that explicit yes.
