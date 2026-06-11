Clone repositories for this project. Per-repo setup (install, Docker, `.env`) is a separate step that isn't wired yet — this command only gets repos onto disk.

Cloning a single repo is always `haus clone <url> [dir]`. This command picks _which_ repos to clone and runs that primitive for each. There are two modes, chosen by whether a name was given.

## Mode A — a project name was given (`project:clone <name>`)

Find one repo by name on GitHub and clone it. Does **not** require a workspace or `repos.manifest.json`.

1. Make sure GitHub CLI is ready: run `gh auth status`. If not authenticated, tell the user to run `gh auth login` and stop.
2. Scope the search to repos the user owns or belongs to: get their login with `gh api user -q .login` and their orgs with `gh api user/orgs -q '.[].login'`.
3. Search by name, passing one `--owner` per login/org from step 2:
   `gh search repos "<name>" --match name --limit 10 --json fullName,description,url,isPrivate,pushedAt --owner <login> [--owner <org> …]`
   If that returns nothing, retry **without** `--owner` (a broader, all-of-GitHub search) and tell the user you widened it.
4. Decide from the results:
   - **0 matches** — tell the user nothing matched `<name>`; offer to try a different name or broaden. Stop.
   - **1 match** — show `fullName` + description and confirm "Clone this one?" before proceeding.
   - **2+ matches** — use `AskUserQuestion` to let the user pick which repo (list each `fullName` with its description; private repos noted). Include a final option like "None of these — search again / broaden" so they can refine.
5. Clone the chosen repo with `haus clone <url> [dir]`, using the `url` from the search result. Default target is a folder named after the repo under the current directory; confirm where it will land before running. Quote the exact command first.
6. Report the result (cloned / skipped if already present / failed). Remind the user that installing dependencies and configuring the repo is still a manual step for now.

## Mode B — no name was given (`project:clone`)

Clone a whole **workspace** from its manifest. Workspace-only (a `repos.manifest.json` at the repo root); for a lone repo without a manifest, use Mode A with a name instead.

1. Confirm `repos.manifest.json` exists at the workspace root. If not, tell the user this mode is for multi-repo workspaces (or they can pass a `<name>` to clone a single repo) and stop.
2. Read `repos.manifest.json`. Each entry has an `id`, a `folder`, and a git URL (`repo`). If entries have no `repo` URL, ask the user to add them (or supply the URLs) — `haus clone` needs a URL per repo.
3. Read `repos.local.json` if present — its `pathOverrides` map (`folder` → absolute path) marks repos the user already has locally.
4. Ask the user, via `AskUserQuestion`, how to obtain the repos:
   - **Clean clone** — clone every manifest repo fresh into its `folder` under the workspace.
   - **Reuse local** — skip any repo already in `repos.local.json` `pathOverrides`; clone only the rest.
5. For each repo to clone, run (quoting it first): `haus clone <repo-url> <folder>` from the workspace root. Offer `--dry-run` first if the user wants a preview. If one repo fails, report it and continue to the next.
6. After the loop, report which repos were cloned, skipped (already present or reused local), and failed. Remind the user that installing dependencies and configuring each repo (`.env`, services) is still a manual step for now.
