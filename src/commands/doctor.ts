import path from "node:path";

import fs from "fs-extra";

import { isHookEnabled, type HookKey } from "../claude/load-hooks-config.js";
import { verifyProjectSettingsHooksContract } from "../claude/verify-hooks-contract.js";
import { BLOCK_BEGIN } from "../claude/write-root-claude-md.js";
import { readContextOrScan } from "../scanner/read-context.js";
import { readJson, readText } from "../utils/fs.js";
import { error, log, warn } from "../utils/logger.js";
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

  // P6: validate root CLAUDE.md import block and managed files.
  const rootClaudeMdPath = path.join(root, "CLAUDE.md");
  const rootClaudeMdContent = await readText(rootClaudeMdPath);
  if (!rootClaudeMdContent) {
    warn("- CLAUDE.md: missing (run `haus apply --write` to create)");
  } else if (!rootClaudeMdContent.includes(BLOCK_BEGIN)) {
    warn("- CLAUDE.md: haus import block missing (run `haus apply --write` to add)");
  } else {
    log("- CLAUDE.md: import block present");
  }

  const wayOfWorkPath = hausPath(root, "haus-way-of-work.md");
  const wayOfWorkExists = await fs.pathExists(wayOfWorkPath);
  if (!wayOfWorkExists) {
    warn("- .haus-workflow/haus-way-of-work.md: missing (run `haus apply --write`)");
  } else {
    const wayOfWorkContent = await readText(wayOfWorkPath);
    const hasHeader = wayOfWorkContent?.split("\n")[0]?.includes("HAUS-MANAGED") ?? false;
    if (!hasHeader) {
      warn("- .haus-workflow/haus-way-of-work.md: no HAUS-MANAGED header (user-owned)");
    } else {
      log("- .haus-workflow/haus-way-of-work.md: OK");
    }
  }

  const projectMdPath = hausPath(root, "project.md");
  const projectMdExists = await fs.pathExists(projectMdPath);
  if (!projectMdExists) {
    warn("- .haus-workflow/project.md: missing (run `haus apply --write`)");
  } else {
    const projectMdContent = await readText(projectMdPath);
    const hasHeader = projectMdContent?.split("\n")[0]?.includes("HAUS-MANAGED") ?? false;
    if (!hasHeader) {
      warn("- .haus-workflow/project.md: no HAUS-MANAGED header (user-owned)");
    } else {
      log("- .haus-workflow/project.md: OK");
    }
  }
}
