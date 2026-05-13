import path from "node:path";

import fs from "fs-extra";

import { HAUS_DIR } from "../utils/paths.js";
import { confirm } from "../utils/prompts.js";

const CLAUDE_DIR = ".claude";

export async function runUndo(options: { yes?: boolean }): Promise<void> {
  const root = process.cwd();
  const targets = [path.join(root, CLAUDE_DIR), path.join(root, HAUS_DIR)];
  const existing = targets.filter((p) => fs.existsSync(p));
  if (existing.length === 0) {
    console.log("Nothing to remove: no .claude/ or .haus-ai/ in this directory.");
    return;
  }
  if (!options.yes) {
    const ok = await confirm(
      `Remove ${existing.map((p) => path.relative(root, p)).join(" and ")}? This cannot be undone.`,
    );
    if (!ok) {
      console.log("Cancelled.");
      return;
    }
  }
  for (const p of existing) {
    await fs.remove(p);
    console.log(`Removed ${path.relative(root, p)}`);
  }
}
