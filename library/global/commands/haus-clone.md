---
description: Clone this project's repositories onto disk (per-repo setup is separate).
---

Clone repositories for this project. Per-repo setup (install, Docker, `.env`) is a separate step that isn't wired yet — this command only gets repos onto disk.

Cloning a single repo is always `haus clone <url> [dir]`. This command picks _which_ repos to clone and runs that primitive for each. There are two modes, chosen by whether a name was given.

**Always ask before cloning — never assume.** The user may already have the repos on disk. Do not start cloning until they have confirmed. A missing `repos.local.json` does **not** mean they want a fresh clone; it just means nothing is recorded yet — you must still ask.

## Mode A — a project name was given (`project:clone <name>`)

Find one repo by name on GitHub and clone it. Does **not** require a workspace or `repos.manifest.json`.

1. Make sure GitHub CLI is ready: run `gh auth status`. If not authenticated, tell the user to run `gh auth login` and stop.
2. Scope the search to repos the user owns or belongs to: get their login with `gh api user -q .login` and their orgs with `gh api user/orgs -q '.[].login'`.
3. Search by name, passing one `--owner` per login/org from step 2:
   `gh search repos "<name>" --match name --limit 10 --json fullName,description,url,isPrivate,pushedAt --owner <login> [--owner <org> …]`
   If that returns nothing, retry **without** `--owner` (a broader, all-of-GitHub search) and tell the user you widened it.
4. Decide from the results:
   - **0 matches** — tell the user nothing matched `<name>`; offer to try a different name or broaden. Stop.
   - **1 match** — show `fullName` + description and ask the user to confirm before cloning.
   - **2+ matches** — use `AskUserQuestion` to let the user pick which repo (list each `fullName` with its description; private repos noted). Include a final option like "None of these — search again / broaden" so they can refine.
5. Once the user has confirmed both the repo and where it should land, clone it with `haus clone <url> [dir]` using the `url` from the search result (default target is a folder named after the repo under the current directory). Quote the exact command first.
6. Report the result (cloned / skipped if already present / failed). Remind the user that installing dependencies and configuring the repo is still a manual step for now.

## Mode B — no name was given (`project:clone`)

Clone a whole **workspace** from its manifest. Workspace-only (a `repos.manifest.json` at the repo root); for a lone repo without a manifest, use Mode A with a name instead.

1. Confirm `repos.manifest.json` exists at the workspace root. If not, tell the user this mode is for multi-repo workspaces (or they can pass a `<name>` to clone a single repo) and stop.
2. Read `repos.manifest.json`. Each entry has an `id`, a `folder`, and a git URL (`repo`). If entries have no `repo` URL, ask the user to add them (or supply the URLs) — `haus clone` needs a URL per repo.
3. Read `repos.local.json` if present — its `pathOverrides` map (`folder` → absolute path) marks repos the user already has locally and does not want re-cloned.
4. **Always ask first**, via `AskUserQuestion` — never skip this, even when `repos.local.json` is absent or every repo is missing locally:
   - **Clean clone** — clone every manifest repo fresh into its `folder` under the workspace.
   - **I already have some or all of them** — the user has clones elsewhere on disk. Ask where they live, then for each repo found there, record it in `repos.local.json` `pathOverrides` (`folder` → absolute path) so it's reused instead of cloned; clone only the repos that aren't found. (You can match by folder name under the directory they give, confirming each.)
   - **Cancel** — do nothing.
5. Show the concrete plan before touching anything: list which repos will be cloned (and into which `folder`) and which will be reused/skipped. Get a final go-ahead.
6. For each repo to clone, run (quoting it first): `haus clone <repo-url> <folder>` from the workspace root. Offer `--dry-run` first if the user wants a preview. If one repo fails, report it and continue to the next.

   **Transport fallback.** Manifest URLs may be SSH (`git@github.com:org/repo.git` or `ssh://…`). Probe SSH connectivity once up front (`ssh -T git@github.com`); if it fails, **auto-fall back to the HTTPS URL** (`https://github.com/org/repo.git`) using your `gh auth` credentials, clone over HTTPS, and **report that you switched transport** so the user knows their SSH is down. Don't halt the run for an SSH outage when HTTPS works.

7. After the loop, report which repos were cloned, reused (local), skipped (already present), and failed. Remind the user that installing dependencies and configuring each repo (`.env`, services) is still a manual step for now.
