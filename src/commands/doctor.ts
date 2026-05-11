import { readJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { readContextOrScan } from "../scanner/read-context.js";
import { verifyProjectSettingsHooksContract } from "../claude/verify-hooks-contract.js";

export async function runDoctor(options?: { hooks?: boolean }): Promise<void> {
  const root = process.cwd();

  if (options?.hooks) {
    const hooks = await verifyProjectSettingsHooksContract(root);
    if (hooks.skipped) {
      console.error(`Haus doctor --hooks: ${hooks.message}`);
      process.exitCode = 1;
      return;
    }
    if (!hooks.ok) {
      console.error(`Haus doctor --hooks: ${hooks.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Haus doctor --hooks: ${hooks.message}`);
    return;
  }

  const context = await readContextOrScan(root);
  const recommendation = await readJson<{ recommended: unknown[]; warnings: string[] }>(hausPath(root, "recommendation.json"));
  console.log("Haus Doctor");
  console.log(`Repo: ${context.repoName}`);
  console.log(`Roles: ${context.repoRoles.join(", ") || "unknown"}`);
  console.log(`Package manager: ${context.packageManager}`);
  console.log(`Recommended items: ${recommendation?.recommended?.length ?? 0}`);
  const warningLines = [...new Set([...context.warnings, ...(recommendation?.warnings ?? [])])];
  for (const warning of warningLines) {
    console.log(`- WARN: ${warning}`);
  }

  const hooks = await verifyProjectSettingsHooksContract(root);
  if (hooks.skipped) {
    console.log(`- HOOKS: (skipped) ${hooks.message}`);
  } else if (!hooks.ok) {
    console.log(`- HOOKS FAIL: ${hooks.message}`);
    process.exitCode = 1;
  } else {
    console.log(`- HOOKS OK: ${hooks.message}`);
  }
}
