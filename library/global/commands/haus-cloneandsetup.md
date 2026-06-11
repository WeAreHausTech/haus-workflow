Clone a project's repos **and** set each one up locally — node version, dependencies, env scaffold. This is `project:clone` followed by a per-repo setup pass.

**Always ask before doing work — never assume.** Cloning and setup both run things that take time, hit the network, and need auth; confirm with the user before each phase, and respect repos they already have.

## Step 1 — Clone

Run the full `project:clone` flow first by following `~/.claude/commands/haus-clone.md` end to end — whichever mode applies:

- A **name** was given → it finds and clones that one repo from GitHub.
- **No name** → it clones the workspace's repos from `repos.manifest.json` (asking clean-clone vs reuse-local first).

When that finishes you have a set of repos on disk (freshly cloned and/or reused-local). Carry that list into Step 2.

## Step 2 — Confirm the setup pass

Before running any setup:

1. List the repos you're about to set up and what each will run (node version select, dependency install, etc.). Get a go-ahead. For repos that were **reused** from an existing local clone, ask whether to (re)run setup there too — they may already be set up.
2. Check `NODE_AUTH_TOKEN` is exported if any repo depends on private `@`-scoped packages (e.g. `@haus-storefront-*`, `@haus-tech/*`). If it's missing, tell the user to set it first — those installs will fail without it. Let them decide whether to continue or stop.

## Step 3 — Set up each repo

For each repo directory, run its setup **in that directory**, detecting what's needed from the repo's own files — don't assume a stack. Run a repo's steps in a single login shell so the selected node version stays active for the install. A robust pattern:

```
bash -lc 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; cd "<repo>" && nvm install && corepack enable && yarn install'
```

**Read the repo's own setup docs first — they win.** Before applying the file-heuristics below, look for the repo's canonical setup instructions: `docs/setup.md`, `CLAUDE.md`, `README.md` (or follow `docs/SUMMARY.md` to the setup page). If present, **follow them as authoritative** — they capture nested or non-standard builds a root file-scan can't see. Use the heuristics below only to fill gaps, or when the repo ships no setup doc. Example: a WordPress/Bedrock repo has **no root `package.json`** — its JS/theme build lives under `web/app/themes/<theme>` and is only described in the docs, so a root-only scan wrongly reports "no JS". When the docs point at a nested build, scan subdirectories for the relevant `package.json` / build script and run it.

Adjust per repo (gap-fill, or when no setup doc exists):

1. **Node version.** If `.nvmrc` (or `engines.node` in `package.json`) is present, select it with `nvm install` (reads `.nvmrc`, installs the version if missing, then switches to it). If the user uses `fnm` instead, `fnm use --install-if-missing`. If neither is available, tell the user the required version and continue on the current node.
2. **JS dependencies.** Enable the pinned package manager with `corepack enable`, then install based on what's present:
   - `yarn.lock` or `packageManager: "yarn@…"` → `yarn install`
   - `pnpm-lock.yaml` → `pnpm install`
   - `package-lock.json` → `npm install`
   - no JS manifest → skip
3. **PHP dependencies.** If `composer.json` is present and `composer` is installed → `composer install`. If composer is missing, note it and skip.
4. **Env scaffold.** If `.env.example` exists and `.env` does not → copy `.env.example` to `.env` (never overwrite an existing `.env`). Tell the user the real values still need filling.

If a repo's setup fails, report the error and **continue to the next repo** — don't abort the whole run.

## Step 4 — Report

Summarise per repo: node version used, dependency install result, composer (if any), env seeded. Then list what's still manual:

- Fill in each `.env` with real values (cross-repo values must match — see the workspace's environment docs).
- Start Docker services and dev servers in dependency order — see the workspace's local-development docs.

**Do not** start servers or run `docker compose up` / `yarn dev` — this command only prepares the repos.
