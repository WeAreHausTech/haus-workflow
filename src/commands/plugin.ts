import fs from "fs-extra";
import path from "node:path";

export async function runPlugin(action: "install" | "validate", _options: Record<string, unknown>): Promise<void> {
  if (action === "install") {
    const root = process.cwd();
    const source = path.join(root, "plugin");
    const destination = path.join(root, ".claude", "plugins", "haus-ai");
    if (!(await fs.pathExists(source))) {
      console.error("plugin directory missing");
      process.exitCode = 1;
      return;
    }
    await fs.ensureDir(path.dirname(destination));
    await fs.copy(source, destination, { overwrite: true, errorOnExist: false });
    console.log(`Plugin installed at ${destination}`);
    return;
  }
  const ok = await fs.pathExists("plugin/.claude-plugin/plugin.json");
  if (!ok) {
    console.error("plugin/.claude-plugin/plugin.json missing");
    process.exitCode = 1;
    return;
  }
  console.log("Plugin validate passed.");
}
