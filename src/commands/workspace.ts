import path from "node:path";

import YAML from "yaml";

import { scanProject } from "../scanner/scan-project.js";
import { readText, writeJson, writeText } from "../utils/fs.js";

export async function runWorkspace(action: "init" | "scan"): Promise<void> {
  if (action === "init") {
    await writeText(
      "haus.workspace.yaml",
      `client: unknown\nrepos:\n  - name: current\n    path: .\n    role: auto\nrelationships: []\n`,
    );
    console.log("Workspace initialized.");
    return;
  }
  const configText = await readText("haus.workspace.yaml");
  if (!configText) {
    console.error("Missing haus.workspace.yaml. Run `haus workspace init` first.");
    process.exitCode = 1;
    return;
  }
  const config = YAML.parse(configText) as { repos?: Array<{ name: string; path: string; role?: string }> };
  const repos = config.repos ?? [];
  if (repos.length === 0) {
    console.error("No repos configured in haus.workspace.yaml.");
    process.exitCode = 1;
    return;
  }

  const summaries: Array<{ name: string; path: string; roles: string[]; packageManager: string; deps: string[] }> = [];
  const ownership: Record<string, string[]> = {};
  for (const repo of repos) {
    const repoRoot = path.resolve(process.cwd(), repo.path);
    const result = await scanProject(repoRoot, "fast");
    summaries.push({
      name: repo.name,
      path: repo.path,
      roles: result.repoRoles,
      packageManager: result.packageManager,
      deps: result.dependencies,
    });
    for (const dep of result.dependencies) {
      ownership[dep] ??= [];
      ownership[dep].push(repo.name);
    }
  }

  await writeJson(".haus-ai/workspace-summary.json", {
    generatedAt: new Date().toISOString(),
    repos: summaries,
  });
  await writeJson(".haus-ai/dependency-ownership-map.json", ownership);
  await writeText(
    ".haus-ai/cross-repo-summary.md",
    `# Cross Repo Summary\n\n${summaries
      .map(
        (repo) =>
          `- ${repo.name} (${repo.path}) roles: ${repo.roles.join(", ") || "unknown"}; package manager: ${repo.packageManager}`,
      )
      .join("\n")}\n`,
  );
  console.log(
    "Workspace scan complete. Wrote .haus-ai/workspace-summary.json, cross-repo-summary.md, dependency-ownership-map.json",
  );
}
