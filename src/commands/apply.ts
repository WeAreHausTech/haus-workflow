import { writeClaudeFiles } from "../claude/write-claude-files.js";
import { log } from "../utils/logger.js";
import { displayPath } from "../utils/paths.js";

export async function runApply(options: { dryRun?: boolean; write?: boolean }): Promise<void> {
  if (!options.dryRun && !options.write) {
    log("Use --dry-run or --write");
    return;
  }
  const root = process.cwd();
  const isDryRun = Boolean(options.dryRun) && !options.write;
  const files = await writeClaudeFiles(root, isDryRun);
  if (isDryRun) {
    log(`Dry-run complete — ${files.length} file(s) planned, none written. Run --write to apply.`);
  } else {
    log("Applied files:");
    files.forEach((f) => log(`- ${displayPath(root, f)}`));
  }
}
