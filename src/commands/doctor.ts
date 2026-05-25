import { isHookEnabled, type HookKey } from "../claude/load-hooks-config.js";
import { verifyProjectSettingsHooksContract } from "../claude/verify-hooks-contract.js";
import { readContextOrScan } from "../scanner/read-context.js";
import { readJson } from "../utils/fs.js";
import { error, log } from "../utils/logger.js";
import { hausPath } from "../utils/paths.js";

export async function runDoctor(options?: { hooks?: boolean }): Promise<void> {
  const root = process.cwd();

  if (options?.hooks) {
    const hooks = await verifyProjectSettingsHooksContract(root);
    if (hooks.skipped) {
      error(`Haus doctor --hooks: ${hooks.message}`);
      process.exitCode = 1;
      return;
    }
    if (!hooks.ok) {
      error(`Haus doctor --hooks: ${hooks.message}`);
      process.exitCode = 1;
      return;
    }
    log(`Haus doctor --hooks: ${hooks.message}`);
    return;
  }

  const context = await readContextOrScan(root);
  const recommendation = await readJson<{ recommended: unknown[]; warnings: string[] }>(
    hausPath(root, "recommendation.json"),
  );
  log("Haus Doctor");
  log(`Repo: ${context.repoName}`);
  log(`Roles: ${context.repoRoles.join(", ") || "unknown"}`);
  log(`Package manager: ${context.packageManager}`);
  log(`Recommended items: ${recommendation?.recommended?.length ?? 0}`);
  const warningLines = [...new Set([...context.warnings, ...(recommendation?.warnings ?? [])])];
  for (const warning of warningLines) {
    log(`- WARN: ${warning}`);
  }

  const hooks = await verifyProjectSettingsHooksContract(root);
  if (hooks.skipped) {
    log(`- HOOKS: (skipped) ${hooks.message}`);
  } else if (!hooks.ok) {
    log(`- HOOKS FAIL: ${hooks.message}`);
    process.exitCode = 1;
  } else {
    log(`- HOOKS OK: ${hooks.message}`);
  }

  // Per-hook gate state (P2 outcome). Guards are always on; only the
  // gated UserPromptSubmit hooks have an opt-in flag.
  const gatedHooks: HookKey[] = ["context", "memoryInject"];
  for (const key of gatedHooks) {
    const enabled = await isHookEnabled(root, key);
    log(`- HOOK ${key}: ${enabled ? "enabled" : "disabled (default)"}`);
  }
}
