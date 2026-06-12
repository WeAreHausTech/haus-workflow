# Local-dev orchestration for `project:cloneandsetup` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `project:cloneandsetup` to discover and run per-repo + workspace `localdev.yml` definitions so a multi-repo workspace reaches "ready to run," and author those definitions for `bad-varme-workspace`.

**Architecture:** The `cloneandsetup` command (an authored agent procedure in `haus-workflow`) gains a localdev format definition and an orchestration phase: discover `.haus-workflow/localdev.yml`, resolve order from the workspace file, run each repo's steps, perform cross-repo links generically, wire shared env, then print ordered start commands. The setup knowledge is authored as data in two file kinds — per-repo (own steps) and workspace (order + links + env). No TypeScript in v1 (decision D3); the agent reads and runs the YAML.

**Tech Stack:** Markdown agent-procedure (`library/global/commands/haus-cloneandsetup.md`), YAML data files, `js-yaml` CLI for validation. Touches the `haus-workflow` repo and the six `bad-varme-workspace` app repos.

**Source spec:** `docs/superpowers/specs/2026-06-12-localdev-orchestration-design.md` (Approved).

**Cross-repo footprint (each is a separate git repo + branch + commit):**

| #   | File                          | Repo                         | Remote                                     |
| --- | ----------------------------- | ---------------------------- | ------------------------------------------ |
| 1–2 | command + skill               | `haus-workflow`              | GitHub `WeAreHausTech/haus-workflow`       |
| 3   | `.haus-workflow/localdev.yml` | `bad-varme-workspace`        | GitHub `WeAreHausTech/bad-varme-workspace` |
| 4   | `.haus-workflow/localdev.yml` | `bad-varme.se`               | Bitbucket `careofhaus/bad-varme.se`        |
| 5   | `.haus-workflow/localdev.yml` | `bov-ecom`                   | GitHub                                     |
| 6   | `.haus-workflow/localdev.yml` | `bov-ecom-elementor-widgets` | GitHub                                     |
| 7   | `.haus-workflow/localdev.yml` | `ecom-elementor-widgets`     | GitHub                                     |
| 8   | `.haus-workflow/localdev.yml` | `ecom-components`            | GitHub                                     |
| 9   | `.haus-workflow/localdev.yml` | `wp-products-sync`           | GitHub                                     |

**Conventions for every task:** work on a feature branch in the relevant repo (NEVER `main`). Commit locally; **do not push** — pushing/PRs to the six app repos is an explicit, user-approved follow-up (Task 11). Validate every YAML file with `npx --yes js-yaml <file>` (parses → prints JSON, exits non-zero on invalid).

---

### Task 1: Define the `localdev.yml` format + orchestration phase in the command

**Goal:** Rewrite `library/global/commands/haus-cloneandsetup.md` so it documents the two file formats and runs the discover → order → steps → links → env → report phase.

**Files:**

- Modify: `library/global/commands/haus-cloneandsetup.md` (full rewrite of Step 3 onward; add a "Local-dev format" section)

**Acceptance Criteria:**

- [ ] The command documents the per-repo and workspace `localdev.yml` schemas (every field the spec lists).
- [ ] It describes the orchestration phase: discover, resolve order, run steps (honoring `node:`/`optional:`, confirming on `remote:`/`destructive:`), perform the three link types, wire env with print-fallback, print ordered start commands.
- [ ] Repos without a `localdev.yml` still fall back to today's heuristic pass.
- [ ] It states links are owned by the workspace and performed generically (D4); notes `setup-dev-mode.sh` is deprecated.
- [ ] `.env` is written with a print-the-values fallback (D5); stops at "ready to run" not "running" (D2).

**Verify:** `grep -c 'localdev.yml' library/global/commands/haus-cloneandsetup.md` → ≥ 4; manual read confirms all six phase steps and both schemas are present.

**Steps:**

- [ ] **Step 1: Replace the command body.** Set the full contents of `library/global/commands/haus-cloneandsetup.md` to:

````markdown
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

### The `localdev.yml` format

**Per-repo — `<repo>/.haus-workflow/localdev.yml`** (how to set up THAT repo alone; sibling-agnostic):

```yaml
needsEnv: [WP_HOME, DB_NAME] # env keys that must be present to run/serve
steps: # ordered; each runs in the repo dir, in a login shell
  - run: 'composer install' # the shell command (required)
    node: 10 # optional: nvm version for THIS step
    remote: true # optional: hits a server (SSH) → confirm first
    destructive: true # optional: drops/overwrites data → confirm first
    optional: true # optional: failure is non-fatal, continue
serve: # optional: printed as a next-step, never auto-run
  via: valet # valet | docker | command
  url: 'https://example.test'
  start: 'yarn dev'
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
3. **Per repo, in order:** run `steps` (select `node:` per step; `optional:` failures continue). **Confirm before any step marked `remote:` or `destructive:`**, every run, even on re-run.
4. **Links** (workspace-owned, performed generically — do NOT call a repo's own `setup-dev-mode.sh`, which is deprecated):
   - `symlink` → `ln -s <from> <to>`; replace an existing symlink, but never clobber a real directory without confirmation.
   - `composer-path` → in `in`'s `composer.json`, set the `dep`'s require to `{ "type": "path", "url": "../<dep-folder>", "options": { "symlink": true } }`, then `composer update <vendor/dep>`.
   - `yarn-link` → `yarn link` in the `dep` repo, then `yarn link <pkg-name>` in each `in` repo (read `<pkg-name>` from the dep's `package.json`).
5. **Env:** for each workspace `env` entry, confirm the `source` is satisfiable, then upsert the value into each sink repo's `.env` under its `key`. **If the write is blocked or fails, print the exact `KEY=value` lines for the user to paste** (decision D5). Real secrets (DB passwords, tokens) remain the user's to fill.
6. **Report + next-steps.** Per-repo summary, then the ordered **start** commands from each repo's `serve.start` plus any manual follow-ups (e.g. `wp sync-products sync`).

**Stops at "ready to run," not "running" (D2):** bring up datastores (`docker compose up -d`), pull DBs, link, build, wire env — but do NOT start foreground dev servers or run the initial product sync. Print those.

## Step 5 — Report

Summarise per repo (node, deps, localdev steps, links, env). Then print, in order, the start commands and manual follow-ups. **Do not** run `yarn dev` / `docker compose up` (foreground) / `wp sync-products` — this command prepares, it does not run the app.
````

- [ ] **Step 2: Verify.** Run `grep -c 'localdev.yml' library/global/commands/haus-cloneandsetup.md` → expect ≥ 4. Read the file top-to-bottom; confirm both schemas and the six numbered run-order steps are present.

- [ ] **Step 3: Commit.**

```bash
cd /Users/johanna/Desktop/Repos/haus-workflow
git add library/global/commands/haus-cloneandsetup.md
git commit -m "feat(cloneandsetup): localdev.yml format + orchestration phase

Discover per-repo + workspace localdev.yml; resolve order; run steps
(confirm remote/destructive); perform symlink/composer-path/yarn-link
generically; wire env with print fallback; print start commands. Stops
at ready-to-run. setup-dev-mode.sh deprecated."
```

---

### Task 2: Update the haus-workflow skill + command descriptions

**Goal:** Make the entry-point skill and any cross-references describe the richer `cloneandsetup` (DB + links + env), not just "node version, deps, .env scaffold."

**Files:**

- Modify: `library/global/skills/haus-workflow/SKILL.md` (the `project:cloneandsetup` table row + menu line 56)
- Modify: `~/.claude/skills/haus-workflow/SKILL.md` is NOT edited here (generated on install) — only the `library/` source.

**Acceptance Criteria:**

- [ ] The `project:cloneandsetup` row and menu item mention databases, cross-repo links, and env wiring via `localdev.yml`.
- [ ] No remaining text claims cloneandsetup only does "node version, deps, `.env` scaffold."

**Verify:** `grep -n 'localdev\|databases\|links' library/global/skills/haus-workflow/SKILL.md` → matches on the cloneandsetup row and menu line.

**Steps:**

- [ ] **Step 1: Edit the table row.** In `library/global/skills/haus-workflow/SKILL.md`, replace the `project:cloneandsetup` description cell:

```
| `project:cloneandsetup [name]` (`cloneandsetup`)                  | _Clone & setup procedure below_ | project | Run `project:clone`, then set up each repo for local dev — deps, databases, cross-repo links, and env — via each repo's `.haus-workflow/localdev.yml` (+ the workspace's order/links/env) |
```

- [ ] **Step 2: Edit the menu line** (around line 56):

```
  6. [project] project:cloneandsetup [name] — clone repos, then set them up for local dev
     (project:clone, then per-repo deps + databases + cross-repo links + env from localdev.yml)
```

- [ ] **Step 3: Verify.** `grep -n 'localdev' library/global/skills/haus-workflow/SKILL.md` → at least the two edited lines.

- [ ] **Step 4: Commit.**

```bash
cd /Users/johanna/Desktop/Repos/haus-workflow
git add library/global/skills/haus-workflow/SKILL.md
git commit -m "docs(haus-workflow): describe cloneandsetup localdev orchestration"
```

---

### Task 3: Author the workspace `localdev.yml` (order + links + env)

**Goal:** Add `bad-varme-workspace/.haus-workflow/localdev.yml` declaring setup order, the three cross-repo links, and the shared Vendure shop-api env.

**Files:**

- Create: `/Users/johanna/Desktop/bad-varme-workspace/.haus-workflow/localdev.yml`

**Acceptance Criteria:**

- [ ] `order` lists all six repos: datastores/Vendure first, WP last.
- [ ] `links` declares the plugin symlink, the composer-path link, and the yarn-link.
- [ ] `env` maps the bov-ecom shop-api URL into the two consumer repos.
- [ ] Valid YAML.

**Verify:** `npx --yes js-yaml /Users/johanna/Desktop/bad-varme-workspace/.haus-workflow/localdev.yml` → prints JSON, exit 0.

**Steps:**

- [ ] **Step 1: Branch.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace
git checkout -b feat/localdev-orchestration
mkdir -p .haus-workflow
```

- [ ] **Step 2: Create the file** `/Users/johanna/Desktop/bad-varme-workspace/.haus-workflow/localdev.yml`:

```yaml
# Local-dev orchestration for the Bad & Värme workspace.
# Run by `project:cloneandsetup`. Per-repo steps live in each repo's
# own .haus-workflow/localdev.yml; this file owns the glue between repos.

order:
  - bov-ecom # Vendure datastores + server first
  - ecom-components # shared React lib (built before its consumers)
  - ecom-elementor-widgets # shared widgets (consumes ecom-components)
  - bov-ecom-elementor-widgets # BoV widgets (consumes both, symlinked into WP)
  - wp-products-sync # WP plugin
  - bad-varme.se # WordPress site last

links:
  # The BoV widgets plugin is symlinked into the WP plugins dir.
  # NOTE: the link path is named ecom-elementor-widgets by convention
  # (matches deploy.php shared dir), though the source is bov-ecom-elementor-widgets.
  - type: symlink
    from: bov-ecom-elementor-widgets
    to: bad-varme.se/web/app/plugins/ecom-elementor-widgets

  # bov-ecom-elementor-widgets consumes the two sibling PHP packages from local path.
  - type: composer-path
    in: bov-ecom-elementor-widgets
    dep: ecom-elementor-widgets
  - type: composer-path
    in: bov-ecom-elementor-widgets
    dep: wp-products-sync

  # The shared React lib is yarn-linked into both widget repos.
  - type: yarn-link
    in: [bov-ecom-elementor-widgets, ecom-elementor-widgets]
    dep: ecom-components

env:
  # The Vendure shop-api URL must match wherever it is consumed.
  - source: { repo: bov-ecom, provides: 'http://localhost:3000/shop-api' }
    sinks:
      - { repo: ecom-components, key: VITE_API_URL }
      - { repo: bov-ecom-elementor-widgets, key: VITE_VENDURE_API_URL }
```

- [ ] **Step 3: Verify.** `npx --yes js-yaml /Users/johanna/Desktop/bad-varme-workspace/.haus-workflow/localdev.yml` → JSON, exit 0.

- [ ] **Step 4: Commit (local only, do not push).**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace
git add .haus-workflow/localdev.yml
git commit -m "feat(localdev): add workspace order/links/env for local dev"
```

---

### Task 4: Author `bad-varme.se/.haus-workflow/localdev.yml`

**Goal:** Declare the WordPress repo's own setup: composer, theme build (node 10), DB pull (remote), serve via Valet.

**Files:**

- Create: `/Users/johanna/Desktop/bad-varme-workspace/bad-varme.se/.haus-workflow/localdev.yml`

**Acceptance Criteria:**

- [ ] Steps: composer install → theme `npm install && npm run build` at node 10 → `dep db:pull staging-oderland` marked `remote: true` → `./dev_db.sh` marked `optional: true`.
- [ ] `needsEnv` lists the five required WP/DB keys from `docs/setup.md`.
- [ ] `serve` is valet at `https://bad-varme.se.test`.
- [ ] Valid YAML; referenced `./dev_db.sh` exists; `dep db:pull` task exists in `deploy.php`.

**Verify:** `npx --yes js-yaml .../bad-varme.se/.haus-workflow/localdev.yml` exit 0; `test -f .../bad-varme.se/dev_db.sh`; `grep -q "db:pull" .../bad-varme.se/deploy.php`.

**Steps:**

- [ ] **Step 1: Branch.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/bad-varme.se
git checkout -b feat/localdev-orchestration
mkdir -p .haus-workflow
```

- [ ] **Step 2: Create** `/Users/johanna/Desktop/bad-varme-workspace/bad-varme.se/.haus-workflow/localdev.yml`:

```yaml
# Local-dev setup for the bad-varme.se WordPress/Bedrock site.
needsEnv: [WP_HOME, WP_SITEURL, DB_NAME, DB_USER, DB_PASSWORD]

steps:
  - run: 'composer install'
  - run: 'cd web/app/themes/careofhaus && npm install && npm run build'
    node: 10 # legacy bower/gulp toolchain pinned in the theme's .nvmrc
  - run: 'dep db:pull staging-oderland'
    remote: true # SSHes to the staging server, imports DB, rewrites URLs to .test
  - run: './dev_db.sh'
    optional: true # updates admin_email on both multisite DBs; non-fatal

serve:
  via: valet
  url: 'https://bad-varme.se.test'
```

- [ ] **Step 3: Verify.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/bad-varme.se
npx --yes js-yaml .haus-workflow/localdev.yml >/dev/null && echo "yaml ok"
test -f dev_db.sh && echo "dev_db.sh present"
grep -q "db:pull" deploy.php && echo "db:pull task present"
```

Expected: `yaml ok`, `dev_db.sh present`, `db:pull task present`.

- [ ] **Step 4: Commit (local only).**

```bash
git add .haus-workflow/localdev.yml
git commit -m "feat(localdev): add local-dev setup definition"
```

---

### Task 5: Author `bov-ecom/.haus-workflow/localdev.yml`

**Goal:** Declare the Vendure backend's setup: datastores via Docker, yarn install, serve via `yarn dev`. DB-from-server pull deferred (server migration 2026-06-15).

**Files:**

- Create: `/Users/johanna/Desktop/bad-varme-workspace/bov-ecom/.haus-workflow/localdev.yml`

**Acceptance Criteria:**

- [ ] Steps: `docker compose up -d` → `yarn install` (node 20).
- [ ] A comment records the deferred DB-from-server pull and the 2026-06-15 migration.
- [ ] `serve` is command `yarn dev` at `http://localhost:3000`.
- [ ] `needsEnv` lists the DB\_\* keys from the repo's `docs/setup.md`.
- [ ] Valid YAML; `docker-compose.yml` exists; `package.json` has a `dev` script.

**Verify:** `npx --yes js-yaml .haus-workflow/localdev.yml` exit 0; `test -f docker-compose.yml`; `node -e "process.exit(require('./package.json').scripts.dev?0:1)"`.

**Steps:**

- [ ] **Step 1: Branch.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/bov-ecom
git checkout -b feat/localdev-orchestration
mkdir -p .haus-workflow
```

- [ ] **Step 2: Create** `/Users/johanna/Desktop/bad-varme-workspace/bov-ecom/.haus-workflow/localdev.yml`:

```yaml
# Local-dev setup for the bov-ecom Vendure backend.
needsEnv: [APP_ENV, DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD]

steps:
  - run: 'docker compose up -d' # MariaDB + Redis + Elasticsearch datastores
  - run: 'yarn install'
    node: 20
  # DB-from-server pull is intentionally NOT here yet: the site migrates to a
  # new server on 2026-06-15. The DB starts empty (DB_SYNCHRONIZE=true builds
  # the schema). Add a `remote: true` pull step once the migration settles.

serve:
  via: command
  url: 'http://localhost:3000'
  start: 'yarn dev' # Vendure server + worker (foreground; run by hand)
```

- [ ] **Step 3: Verify.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/bov-ecom
npx --yes js-yaml .haus-workflow/localdev.yml >/dev/null && echo "yaml ok"
test -f docker-compose.yml && echo "compose present"
node -e "process.exit(require('./package.json').scripts.dev?0:1)" && echo "dev script present"
```

Expected: `yaml ok`, `compose present`, `dev script present`.

- [ ] **Step 4: Commit (local only).**

```bash
git add .haus-workflow/localdev.yml
git commit -m "feat(localdev): add local-dev setup definition"
```

---

### Task 6: Author `bov-ecom-elementor-widgets/.haus-workflow/localdev.yml`

**Goal:** Declare the BoV widgets plugin's own setup (deps + build). Linking is workspace-owned (Task 3), so this file declares NO links.

**Files:**

- Create: `/Users/johanna/Desktop/bad-varme-workspace/bov-ecom-elementor-widgets/.haus-workflow/localdev.yml`

**Acceptance Criteria:**

- [ ] Steps: `yarn install` → `composer install` → `yarn build` (node 20).
- [ ] `needsEnv: [NODE_AUTH_TOKEN]`; a comment notes composer `auth.json` is also needed.
- [ ] No `links` (workspace owns them).
- [ ] Valid YAML; `package.json` has a `build` script.

**Verify:** `npx --yes js-yaml .haus-workflow/localdev.yml` exit 0; `node -e "process.exit(require('./package.json').scripts.build?0:1)"`.

**Steps:**

- [ ] **Step 1: Branch.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/bov-ecom-elementor-widgets
git checkout -b feat/localdev-orchestration
mkdir -p .haus-workflow
```

- [ ] **Step 2: Create** the file:

```yaml
# Local-dev setup for bov-ecom-elementor-widgets (WordPress plugin).
# Cross-repo links (composer-path to ecom-elementor-widgets / wp-products-sync,
# yarn-link to ecom-components) are owned by the workspace localdev.yml.
needsEnv: [NODE_AUTH_TOKEN] # + composer auth.json (GitHub PAT) for VCS deps

steps:
  - run: 'yarn install'
    node: 20
  - run: 'composer install'
  - run: 'yarn build'
```

- [ ] **Step 3: Verify.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/bov-ecom-elementor-widgets
npx --yes js-yaml .haus-workflow/localdev.yml >/dev/null && echo "yaml ok"
node -e "process.exit(require('./package.json').scripts.build?0:1)" && echo "build script present"
```

Expected: `yaml ok`, `build script present`.

- [ ] **Step 4: Commit (local only).**

```bash
git add .haus-workflow/localdev.yml
git commit -m "feat(localdev): add local-dev setup definition"
```

---

### Task 7: Author `ecom-elementor-widgets/.haus-workflow/localdev.yml`

**Goal:** Declare the shared widgets plugin's own setup (deps + build).

**Files:**

- Create: `/Users/johanna/Desktop/bad-varme-workspace/ecom-elementor-widgets/.haus-workflow/localdev.yml`

**Acceptance Criteria:**

- [ ] Steps: `yarn install` → `yarn build` (node 20).
- [ ] `needsEnv: [NODE_AUTH_TOKEN]`.
- [ ] Valid YAML; `package.json` has a `build` script.

**Verify:** `npx --yes js-yaml .haus-workflow/localdev.yml` exit 0; `node -e "process.exit(require('./package.json').scripts.build?0:1)"`.

**Steps:**

- [ ] **Step 1: Branch.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/ecom-elementor-widgets
git checkout -b feat/localdev-orchestration
mkdir -p .haus-workflow
```

- [ ] **Step 2: Create** the file:

```yaml
# Local-dev setup for ecom-elementor-widgets (shared Haus Elementor plugin).
needsEnv: [NODE_AUTH_TOKEN]

steps:
  - run: 'yarn install'
    node: 20
  - run: 'yarn build'
```

- [ ] **Step 3: Verify.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/ecom-elementor-widgets
npx --yes js-yaml .haus-workflow/localdev.yml >/dev/null && echo "yaml ok"
node -e "process.exit(require('./package.json').scripts.build?0:1)" && echo "build script present"
```

Expected: `yaml ok`, `build script present`.

- [ ] **Step 4: Commit (local only).**

```bash
git add .haus-workflow/localdev.yml
git commit -m "feat(localdev): add local-dev setup definition"
```

---

### Task 8: Author `ecom-components/.haus-workflow/localdev.yml`

**Goal:** Declare the shared React library's own setup (deps + build) and the Vendure env keys it needs for codegen.

**Files:**

- Create: `/Users/johanna/Desktop/bad-varme-workspace/ecom-components/.haus-workflow/localdev.yml`

**Acceptance Criteria:**

- [ ] Steps: `yarn install` → `yarn build` (node 20).
- [ ] `needsEnv: [VITE_API_URL, VITE_VENDURE_TOKEN]` (per the repo's `docs/setup.md`).
- [ ] Valid YAML; `package.json` has a `build` script.

**Verify:** `npx --yes js-yaml .haus-workflow/localdev.yml` exit 0; `node -e "process.exit(require('./package.json').scripts.build?0:1)"`.

**Steps:**

- [ ] **Step 1: Branch.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/ecom-components
git checkout -b feat/localdev-orchestration
mkdir -p .haus-workflow
```

- [ ] **Step 2: Create** the file:

```yaml
# Local-dev setup for ecom-components (shared React component library).
# VITE_API_URL is filled by the workspace env map (bov-ecom shop-api).
needsEnv: [VITE_API_URL, VITE_VENDURE_TOKEN]

steps:
  - run: 'yarn install'
    node: 20
  - run: 'yarn build'
```

- [ ] **Step 3: Verify.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/ecom-components
npx --yes js-yaml .haus-workflow/localdev.yml >/dev/null && echo "yaml ok"
node -e "process.exit(require('./package.json').scripts.build?0:1)" && echo "build script present"
```

Expected: `yaml ok`, `build script present`.

- [ ] **Step 4: Commit (local only).**

```bash
git add .haus-workflow/localdev.yml
git commit -m "feat(localdev): add local-dev setup definition"
```

---

### Task 9: Author `wp-products-sync/.haus-workflow/localdev.yml`

**Goal:** Declare the sync plugin's own setup (composer + admin app build) and surface the initial sync as a printed next-step.

**Files:**

- Create: `/Users/johanna/Desktop/bad-varme-workspace/wp-products-sync/.haus-workflow/localdev.yml`

**Acceptance Criteria:**

- [ ] Steps: `composer install` → `yarn install` → `yarn build` (node 22).
- [ ] `serve` notes the manual `wp sync-products sync` follow-up.
- [ ] Valid YAML; `package.json` has a `build` script.

**Verify:** `npx --yes js-yaml .haus-workflow/localdev.yml` exit 0; `node -e "process.exit(require('./package.json').scripts.build?0:1)"`.

**Steps:**

- [ ] **Step 1: Branch.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/wp-products-sync
git checkout -b feat/localdev-orchestration
mkdir -p .haus-workflow
```

- [ ] **Step 2: Create** the file:

```yaml
# Local-dev setup for wp-products-sync (WP <-> Vendure product sync plugin).
steps:
  - run: 'composer install'
  - run: 'yarn install'
    node: 22
  - run: 'yarn build'

serve:
  via: command
  # Initial product sync is a manual follow-up once Vendure + WP are running.
  start: 'wp sync-products sync'
```

- [ ] **Step 3: Verify.**

```bash
cd /Users/johanna/Desktop/bad-varme-workspace/wp-products-sync
npx --yes js-yaml .haus-workflow/localdev.yml >/dev/null && echo "yaml ok"
node -e "process.exit(require('./package.json').scripts.build?0:1)" && echo "build script present"
```

Expected: `yaml ok`, `build script present`.

- [ ] **Step 4: Commit (local only).**

```bash
git add .haus-workflow/localdev.yml
git commit -m "feat(localdev): add local-dev setup definition"
```

---

### Task 10: Dry-run verification of the orchestration against the workspace

**Goal:** Prove the new command + the seven files produce the correct ordered plan (steps, links, env) without executing destructive/remote steps.

**Files:**

- None created. Reads: all seven `localdev.yml` files + `library/global/commands/haus-cloneandsetup.md`.

**Acceptance Criteria:**

- [ ] All seven YAML files parse.
- [ ] Following the command's "Run order" against the workspace, the resolved repo order equals: bov-ecom, ecom-components, ecom-elementor-widgets, bov-ecom-elementor-widgets, wp-products-sync, bad-varme.se.
- [ ] The three link operations resolve to real paths/packages on disk (symlink target dir's parent exists; composer `dep` folders exist; `ecom-components` `package.json` name reads as `@haus-tech/ecom-components`).
- [ ] The env map's source (`bov-ecom`) and both sinks exist; the printed `KEY=value` lines are `VITE_API_URL=...` and `VITE_VENDURE_API_URL=...`.
- [ ] The dry-run prints the ordered start commands (`yarn dev` for bov-ecom, valet URL for bad-varme.se, `wp sync-products sync` follow-up) and runs NO `dep db:pull`, `docker compose up`, or `.env` write.

**Verify:**

```bash
WS=/Users/johanna/Desktop/bad-varme-workspace
for f in "$WS/.haus-workflow/localdev.yml" \
         "$WS/bad-varme.se/.haus-workflow/localdev.yml" \
         "$WS/bov-ecom/.haus-workflow/localdev.yml" \
         "$WS/bov-ecom-elementor-widgets/.haus-workflow/localdev.yml" \
         "$WS/ecom-elementor-widgets/.haus-workflow/localdev.yml" \
         "$WS/ecom-components/.haus-workflow/localdev.yml" \
         "$WS/wp-products-sync/.haus-workflow/localdev.yml"; do
  npx --yes js-yaml "$f" >/dev/null && echo "ok: $f" || echo "FAIL: $f"
done
node -e "console.log(require('$WS/ecom-components/package.json').name)"   # expect @haus-tech/ecom-components
test -d "$WS/bad-varme.se/web/app/plugins" && echo "plugins dir ok"
```

Expected: seven `ok:` lines, `@haus-tech/ecom-components`, `plugins dir ok`.

**Steps:**

- [ ] **Step 1: Validate all YAML** — run the `Verify` block above; confirm seven `ok:` lines.
- [ ] **Step 2: Walk the order** — read the workspace `order` and confirm it matches the expected sequence; confirm each listed repo has a `localdev.yml`.
- [ ] **Step 3: Resolve links** — confirm `bad-varme.se/web/app/plugins` exists (symlink parent), `ecom-elementor-widgets` and `wp-products-sync` folders exist (composer-path deps), and `ecom-components` package name reads as `@haus-tech/ecom-components` (yarn-link dep).
- [ ] **Step 4: Resolve env** — confirm `bov-ecom`, `ecom-components`, `bov-ecom-elementor-widgets` exist; note the two `KEY=value` lines that would be written/printed.
- [ ] **Step 5: Dry-run report** — produce the ordered start-command list a real run would print. Confirm NO destructive/remote command would run in this dry-run.
- [ ] **Step 6: Record evidence** — capture the verify output into the task's completion note. (No commit; this task only validates.)

---

### Task 11: Push + PRs (user-approved follow-up)

**Goal:** Get the eight branches reviewed and merged. **Requires explicit user OK per branch — do not push without it.**

**Files:** None.

**Acceptance Criteria:**

- [ ] User has approved pushing each repo's `feat/localdev-orchestration` branch.
- [ ] For `haus-workflow`: branch pushed, PR opened, and (after merge) the catalog/version release flow followed per its `CLAUDE.md` (release is a separate, normal haus process — out of this plan's scope to execute).

**Verify:** `git -C <repo> status` shows the branch pushed and a PR URL exists for each repo the user approved.

**Steps:**

- [ ] **Step 1:** Ask the user which repos to push (all eight, or a subset). NEVER push without explicit OK.
- [ ] **Step 2:** For each approved repo: `git push -u origin feat/localdev-orchestration` then `gh pr create` (or the Bitbucket equivalent for `bad-varme.se`).
- [ ] **Step 3:** Report the PR URLs. Note that shipping the `haus-workflow` change to users also needs its normal release (version bump + catalog), which is a separate task.

---

## Notes / deliberate scope choices

- **No TypeScript in v1 (D3):** the command is agent-run; there is no parser module or unit test suite. Verification is YAML-validity + the Task 10 dry-run. A tested `src/localdev/parse.ts` + `haus setup-localdev` binary is the natural follow-up and would reuse these exact files.
- **`.env` deny not weakened globally:** the command attempts the `.env` write and falls back to printing (D5). The shipped `Write(.env)` secret-deny is left intact; to make writes seamless in this workspace the user can remove `Write(.env)` from the workspace's own `.claude/settings.json` deny list — their call.
- **`bov-ecom` DB pull deferred** to after the 2026-06-15 server migration.
- **`setup-dev-mode.sh` / `revert-dev-mode.sh`** in `bov-ecom-elementor-widgets` are now redundant (links are workspace-owned). Removing them is a separate cleanup, not in this plan.
