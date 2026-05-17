import path from "node:path";

import fs from "fs-extra";

import { error, log } from "../utils/logger.js";
import { packageRoot } from "../utils/paths.js";

export async function runPlugin(_action: "validate", _options: Record<string, unknown>): Promise<void> {
  const source = await resolvePluginSourcePath();
  const ok = await fs.pathExists(path.join(source, ".claude-plugin/plugin.json"));
  if (!ok) {
    error("plugin/.claude-plugin/plugin.json missing");
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
