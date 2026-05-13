import { writeClaudeFiles } from "../claude/write-claude-files.js";
import { log } from "../utils/logger.js";
import { displayPath } from "../utils/paths.js";

export async function runApply(options: { dryRun?: boolean; write?: boolean }): Promise<void> {
  if (!options.dryRun && !options.write) {
    log("Use --dry-run or --write");
    return;
  }
  const root = process.cwd();
  const files = await writeClaudeFiles(root, Boolean(options.dryRun) && !options.write);
  log(options.write ? "Applied files:" : "Planned files:");
  files.forEach((f) => log(`- ${displayPath(root, f)}`));
}
