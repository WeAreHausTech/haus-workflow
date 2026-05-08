import { readJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { readContextOrScan } from "../scanner/read-context.js";

export async function runDoctor(): Promise<void> {
  const root = process.cwd();
  const context = await readContextOrScan(root);
  const recommendation = await readJson<{ recommended: unknown[]; warnings: string[] }>(hausPath(root, "recommendation.json"));
  console.log("Haus Doctor");
  console.log(`Repo: ${context.repoName}`);
  console.log(`Roles: ${context.repoRoles.join(", ") || "unknown"}`);
  console.log(`Package manager: ${context.packageManager}`);
  console.log(`Recommended items: ${recommendation?.recommended?.length ?? 0}`);
  for (const warning of [...context.warnings, ...(recommendation?.warnings ?? [])]) {
    console.log(`- WARN: ${warning}`);
  }
}
