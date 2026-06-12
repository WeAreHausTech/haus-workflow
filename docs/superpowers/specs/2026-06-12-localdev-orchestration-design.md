# Local-dev orchestration for `project:cloneandsetup`

- **Status:** Draft (pending user review) | **Date:** 2026-06-12
- **Feature branch:** `feat/localdev-orchestration`
- **Spans:** `haus-workflow` (format + command change) and any workspace that adopts it (first: `bad-varme-workspace`)

## Problem

`project:cloneandsetup` today clones repos and does a generic per-repo setup pass
(node version → JS deps → composer → `.env` scaffold). It then **stops** and prints
"still manual": fill `.env`, create databases, start services. For a real multi-repo
workspace that is most of the work — and it is repo-specific and cross-repo:

- **bad-varme.se** (WordPress/Bedrock): the local DB is pulled from a server with
  Deployer (`dep db:pull staging-oderland`), then a theme asset build on legacy node.
- **bov-ecom** (Vendure): needs datastores (MariaDB + Redis + Elasticsearch) in Docker
  and its DB fetched from the server.
- **bov-ecom-elementor-widgets / ecom-elementor-widgets / ecom-components**: no DB, but
  they must be **linked to each other and into the WP site** — a filesystem symlink into
  `bad-varme.se/web/app/plugins/`, a composer `path` repository, and `yarn link`.
- The **order** matters (datastores → Vendure → WordPress → product sync → widgets) and
  some **env values must match across repos** (the Vendure shop-api URL, etc.).

None of this is captured anywhere a tool can run. The setup logic that _does_ exist is
scattered across repo scripts (`setup-dev-mode.sh`), Deployer config, and prose docs.

## Goal

Carry a workspace from "cloned" to **ready to run** — databases present, repos linked,
env wired — by having `cloneandsetup` discover and run setup definitions that live with
the code. "Ready to run," not "running": datastores come up, but foreground dev servers
and the initial product sync are printed as ordered next-steps, not started.

## Approach (orchestrator over declared setup)

The command becomes a **conductor**. The setup knowledge lives in two declarative files,
split by ownership:

1. **Per-repo `.haus-workflow/localdev.yml`** — how to set up _that repo alone_. Sibling-
   agnostic and portable: its own ordered steps, its own required env keys, how it serves.
2. **Workspace `.haus-workflow/localdev.yml`** — the glue _between_ repos: setup/startup
   `order`, the inter-repo `links`, and the shared `env` map. This matches the role the
   workspace repo already claims ("the glue only: repo map, integration boundaries,
   cross-repo env alignment, startup order").

The orchestrator owns links generically (decision **D4**) — it performs `symlink`,
`composer-path`, and `yarn-link` itself rather than calling a repo's bespoke linking
script. Existing scripts (`setup-dev-mode.sh`, `revert-dev-mode.sh`) are thereby made
redundant and deprecated.

## File formats

### Per-repo: `<repo>/.haus-workflow/localdev.yml`

```yaml
# All fields optional; a repo with no localdev.yml falls back to today's heuristics.
needsEnv: [WP_HOME, DB_NAME, DB_USER, DB_PASSWORD] # keys that must be present to run/serve
steps: # ordered; run in this repo's dir
  - run: 'composer install' # required: the shell command
    node: 10 # optional: nvm version for THIS step
    remote: true # optional: hits a server (SSH) → confirm first
    destructive: true # optional: drops/overwrites data → confirm first
    optional: true # optional: failure is non-fatal, continue
serve: # optional: how the repo runs (printed, not auto-run)
  via: valet # valet | docker | command
  url: 'https://bad-varme.se.test'
  start: 'yarn dev' # the command a human runs to start it
```

Rules:

- Steps run **in order**, each in the repo directory, in a login shell so the selected
  `node:` stays active for that step.
- A step with `remote:` or `destructive:` requires explicit confirmation before running.
- A non-`optional` step that fails stops _this repo_ but not the whole run (report and
  continue to the next repo, as today).

### Workspace: `<workspace>/.haus-workflow/localdev.yml`

```yaml
order: [
    bov-ecom,
    ecom-components,
    ecom-elementor-widgets,
    bov-ecom-elementor-widgets,
    wp-products-sync,
    bad-varme.se,
  ] # by manifest id

links:
  - type: symlink # create a filesystem symlink
    from: bov-ecom-elementor-widgets # workspace-relative source (the repo folder)
    to: bad-varme.se/web/app/plugins/ecom-elementor-widgets # workspace-relative link path
  - type: composer-path # rewrite a composer require to a local path repo (symlinked)
    in: bov-ecom-elementor-widgets # the consuming repo
    dep: ecom-elementor-widgets # the sibling whose folder becomes the path url
  - type: yarn-link # `yarn link` a sibling package into one or more repos
    in: [bov-ecom-elementor-widgets, ecom-elementor-widgets]
    dep: ecom-components # the sibling package (its package.json name is read)

env: # shared values written into sink repos' .env
  - source: { repo: bov-ecom, provides: 'http://localhost:3000/shop-api' }
    sinks:
      - { repo: ecom-components, key: VITE_API_URL }
      - { repo: bov-ecom-elementor-widgets, key: VITE_VENDURE_API_URL }
```

Link types the orchestrator knows:

- **symlink** — `ln -s <from> <to>` (idempotent: replace an existing symlink, refuse to
  clobber a real directory without confirmation).
- **composer-path** — in `in`'s `composer.json`, switch the `dep`'s entry to
  `{ "type": "path", "url": "../<dep-folder>", "options": { "symlink": true } }` and run
  `composer update <vendor/dep>`. (Replaces what `setup-dev-mode.sh` did with `jq`.)
- **yarn-link** — `yarn link` the `dep` package, then `yarn link <name>` inside each `in`
  repo (name read from the dep's `package.json`).

## The `cloneandsetup` change

`library/global/commands/haus-cloneandsetup.md` gains a phase between "set up each repo"
and the final report:

1. **Discover.** After clone + the existing per-repo pass, look for `.haus-workflow/localdev.yml`
   in the workspace and in each repo.
2. **Resolve order.** Walk the workspace `order` (repos absent from `order` run last, in
   manifest order). If no workspace file, use manifest order.
3. **Per repo, in order:** run `localdev.yml` `steps` (honoring `node:` / `optional:`,
   confirming before `remote:`/`destructive:`). A repo with no file → today's heuristics.
4. **Links.** Perform the workspace `links` (symlink / composer-path / yarn-link),
   idempotently, after the repos they reference are set up.
5. **Env.** For each workspace `env` entry, ensure the source is satisfiable and write the
   value into each sink repo's `.env` under its `key`. (See open question on `.env` policy.)
6. **Report + next-steps.** Summarize per repo, then print the ordered **start** commands
   from each repo's `serve.start` and any manual follow-ups (e.g. `wp sync-products sync`).

## Decisions

- **D1 — Secrets / remote access:** reuse what is already on the machine (`~/.ssh`, the
  Deployer hosts in each repo's `deploy.php`, composer `auth.json`, `NODE_AUTH_TOKEN`). The
  command never stores credentials; it only confirms before remote/destructive steps.
- **D2 — Stops at "ready to run":** brings up datastores (`docker compose up -d`), pulls
  DBs, links, builds, wires env. Does **not** start foreground dev servers or run the
  initial product sync — those are printed as ordered next-steps. (A `--start` flag is
  future work.)
- **D3 — v1 deliverable is the markdown agent-task**, not a new TS binary. `cloneandsetup`
  (an authored agent procedure) reads and runs the `localdev.yml` files. A deterministic
  `haus setup-localdev` subcommand that reuses the same files is a clean follow-up.
- **D4 — Links owned by the workspace, performed generically** by the orchestrator;
  `setup-dev-mode.sh` / `revert-dev-mode.sh` are deprecated.

## Application to `bad-varme-workspace`

Author seven files (six repo, one workspace). Summary of contents:

| Repo                         | `localdev.yml` essentials                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bad-varme.se`               | env: WP*HOME/SITEURL/DB*\*; steps: composer install → theme `npm install && npm run build` (node 10) → `dep db:pull staging-oderland` (remote) → `./dev_db.sh` (optional); serve: valet @ `https://bad-varme.se.test` |
| `bov-ecom`                   | env: APP*ENV/DB*\*; steps: `docker compose up -d` (datastores) → fetch DB from server (remote) → `yarn install`; serve: command `yarn dev` @ `http://localhost:3000`                                                  |
| `ecom-components`            | env: VITE_API_URL/VITE_VENDURE_TOKEN; steps: `yarn install` → `yarn build`                                                                                                                                            |
| `ecom-elementor-widgets`     | env: NODE_AUTH_TOKEN; steps: `yarn install` → `yarn build`                                                                                                                                                            |
| `bov-ecom-elementor-widgets` | env: NODE_AUTH_TOKEN (+ composer `auth.json`); steps: `yarn install` → `composer install` → `yarn build` (linking moved to workspace)                                                                                 |
| `wp-products-sync`           | steps: `composer install` → `yarn install` → `yarn build`; next-step: `wp sync-products sync`                                                                                                                         |

Workspace file: the `order`, `links`, and `env` shown in the format section above
(symlink widget plugin into WP; composer-path + yarn-link the widget/component repos;
share the Vendure shop-api URL).

## Safety & idempotency

- Re-running is safe: deps re-install cleanly, symlinks are replaced not duplicated,
  composer-path/yarn-link are no-ops if already applied, env keys are upserted.
- Remote (`dep db:pull`, server DB fetch) and destructive (DB drop/import) steps **always
  confirm**, even on re-run.
- A real (non-symlink) directory at a symlink target is never clobbered without confirm.
- Per-repo failure is isolated; the run continues and the report lists what failed.

## Open questions (for spec review)

- **`.env` writing vs policy.** Step 5 writes shared values into sink `.env` files, and the
  per-repo pass scaffolds `.env` from `.env.example`. The shipped workflow `settings.json`
  **denies `Write(.env)`**. Options: (a) relax the deny for `cloneandsetup` and write
  non-secret local values; (b) never write `.env` — only _report_ the values to set; (c)
  write a separate `.env.local`/print-and-confirm. Needs a decision before implementation.
- **`bov-ecom` DB fetch mechanism is unknown.** WP has `dep db:pull`; bov-ecom has a
  docker-compose + devcontainer but no discovered "pull DB from server" task. Before
  authoring its `localdev.yml` we must determine how its DB is obtained (a script? a
  documented dump+restore? does dev just start empty with `DB_SYNCHRONIZE=true` + seed?).
  Resolve while authoring the workspace files.

## Out of scope (v1)

- A deterministic `haus setup-localdev` TS subcommand (follow-up; same file formats).
- A `--start` mode that launches dev servers and runs the initial sync.
- Auto-provisioning datastores beyond `docker compose up -d` (no managed MySQL install).

## Verification

- Format: a workspace + repo `localdev.yml` pair parses and the described run order is
  produced (dry-run listing of steps/links/env in order).
- Applied to `bad-varme-workspace`: a fresh clone reaches "ready to run" — DBs present,
  the three links exist on disk, sink `.env` files carry the shared values — with only the
  printed start commands left to run by hand.
