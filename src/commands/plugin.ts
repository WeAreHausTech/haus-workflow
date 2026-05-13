import os from "node:os";
import path from "node:path";

import fs from "fs-extra";

import { displayPath, packageRoot } from "../utils/paths.js";

export async function runPlugin(action: "install" | "validate", _options: Record<string, unknown>): Promise<void> {
  if (action === "install") {
    const source = await resolvePluginSourcePath();
    const destination = resolvePluginInstallPath();
    if (!(await fs.pathExists(source))) {
      console.error("plugin directory missing");
      process.exitCode = 1;
      return;
    }
    await fs.ensureDir(path.dirname(destination));
    await fs.copy(source, destination, { overwrite: true, errorOnExist: false });
    console.log(`Plugin installed at ${displayPath(process.cwd(), destination)}`);
    return;
  }
  const source = await resolvePluginSourcePath();
  const ok = await fs.pathExists(path.join(source, ".claude-plugin/plugin.json"));
  if (!ok) {
    console.error("plugin/.claude-plugin/plugin.json missing");
    process.exitCode = 1;
    return;
  }
  console.log("Plugin validate passed.");
}

function resolvePluginInstallPath(): string {
  const custom = process.env.HAUS_PLUGIN_DIR?.trim();
  if (custom) return path.resolve(custom);
  // Default global user install path; can be overridden by HAUS_PLUGIN_DIR.
  return path.join(os.homedir(), ".claude", "plugins", "haus-ai");
}

async function resolvePluginSourcePath(): Promise<string> {
  const candidates = [path.join(process.cwd(), "plugin"), path.join(packageRoot(), "plugin")];
  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) return candidate;
  }
  return candidates[0];
}
