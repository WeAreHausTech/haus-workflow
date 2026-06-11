Workspace-only (a `repos.manifest.json` at the repo root). For a single repo, use `project:init` instead. This task **clones the repos only** — per-repo setup (install, Docker, env) is a separate step that isn't wired yet.

Cloning is one repo at a time via `haus clone <url> [dir]`; this task is just the orchestration loop over the workspace's manifest.

1. Confirm `repos.manifest.json` exists at the workspace root. If not, tell the user this task is for multi-repo workspaces and stop.
2. Read `repos.manifest.json`. Each entry has an `id`, a `folder`, and a git URL (`repo`). If entries have no `repo` URL, ask the user to add them (or supply the URLs) — `haus clone` needs a URL per repo.
3. Read `repos.local.json` if present — its `pathOverrides` map (`folder` → absolute path) marks repos the user already has locally.
4. Ask the user, via `AskUserQuestion`, how to obtain the repos:
   - **Clean clone** — clone every manifest repo fresh into its `folder` under the workspace.
   - **Reuse local** — skip any repo already in `repos.local.json` `pathOverrides`; clone only the rest.
5. For each repo to clone, run (quoting it first): `haus clone <repo-url> <folder>` from the workspace root. Offer `--dry-run` first if the user wants a preview. If one repo fails, report it and continue to the next.
6. After the loop, report which repos were cloned, skipped (already present or reused local), and failed. Remind the user that installing dependencies and configuring each repo (`.env`, services) is still a manual step for now.
