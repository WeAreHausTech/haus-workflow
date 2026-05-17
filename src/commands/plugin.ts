import path from "node:path";

import fs from "fs-extra";

import { loadClaudeHooksSettings } from "../claude/load-hooks.js";
import { error, log } from "../utils/logger.js";
import { packageRoot } from "../utils/paths.js";

export async function runPlugin(_action: "validate", _options: Record<string, unknown>): Promise<void> {
  const source = await resolvePluginSourcePath();
  const manifestOk = await fs.pathExists(path.join(source, ".claude-plugin/plugin.json"));
  if (!manifestOk) {
    error("plugin/.claude-plugin/plugin.json missing");
    process.exitCode = 1;
    return;
  }
  const hooksPath = path.join(source, "hooks/hooks.json");
  if (!(await fs.pathExists(hooksPath))) {
    error("plugin/hooks/hooks.json missing");
    process.exitCode = 1;
    return;
  }
  try {
    await loadClaudeHooksSettings();
  } catch (err) {
    error(`plugin/hooks/hooks.json invalid: ${String(err)}`);
    process.exitCode = 1;
    return;
  }
  log("Plugin validate passed.");
}

async function resolvePluginSourcePath(): Promise<string> {
  const candidates = [path.join(process.cwd(), "plugin"), path.join(packageRoot(), "plugin")];
  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) return candidate;
  }
  return candidates[0];
}
