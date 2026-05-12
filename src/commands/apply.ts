import { writeClaudeFiles } from "../claude/write-claude-files.js";
import { displayPath } from "../utils/paths.js";

export async function runApply(options: { dryRun?: boolean; write?: boolean }): Promise<void> {
  if (!options.dryRun && !options.write) {
    console.log("Use --dry-run or --write");
    return;
  }
  const root = process.cwd();
  const files = await writeClaudeFiles(root, Boolean(options.dryRun) && !options.write);
  console.log(options.write ? "Applied files:" : "Planned files:");
  files.forEach((f) => console.log(`- ${displayPath(root, f)}`));
}
