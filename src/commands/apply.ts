import checkbox from "@inquirer/checkbox";

import { writeClaudeFiles } from "../claude/write-claude-files.js";
import type { Recommendation } from "../types.js";
import { readJson } from "../utils/fs.js";
import { error, log } from "../utils/logger.js";
import { displayPath, hausPath } from "../utils/paths.js";

export async function runApply(options: { dryRun?: boolean; write?: boolean; select?: boolean }): Promise<void> {
  if (!options.dryRun && !options.write) {
    log("Use --dry-run or --write");
    return;
  }
  const root = process.cwd();
  const isDryRun = Boolean(options.dryRun) && !options.write;

  let selectedIds: string[] | undefined;

  if (options.select) {
    if (!process.stdin.isTTY) {
      error("--select requires an interactive terminal (stdin is not a TTY)");
      process.exitCode = 1;
      return;
    }
    const rec = await readJson<Recommendation>(hausPath(root, "recommendation.json"));
    if (!rec) {
      log("No recommendation.json found — run `haus recommend` first. Writing core files only.");
      selectedIds = [];
    } else if (rec.recommended.length === 0) {
      log("Recommendation contains no catalog items. Writing core files only.");
      selectedIds = [];
    } else {
      const choices = items.map((item) => ({
        name: `${item.id}  [${item.confidenceLevel}] — ${item.reason}`,
        value: item.id,
        checked: true,
      }));
      const chosen = await checkbox({
        message: "Select catalog items to apply (space to toggle, enter to confirm):",
        choices,
        pageSize: Math.min(20, items.length + 2),
      });
      selectedIds = chosen;
      log(`Selected ${selectedIds.length} of ${items.length} catalog items.`);
    }
  }

  const files = await writeClaudeFiles(root, isDryRun, selectedIds);
  if (isDryRun) {
    log(`Dry-run complete — ${files.length} file(s) planned, none written. Run --write to apply.`);
  } else {
    log("Applied files:");
    files.forEach((f) => log(`- ${displayPath(root, f)}`));
  }
}
