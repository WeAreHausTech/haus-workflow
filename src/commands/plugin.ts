import fs from "fs-extra";

export async function runPlugin(action: "install" | "validate", _options: Record<string, unknown>): Promise<void> {
  if (action === "install") {
    console.log("Plugin install: copy plugin folder into Claude Code plugin path manually.");
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
