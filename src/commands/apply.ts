import { writeClaudeFiles } from "../claude/write-claude-files.js";

export async function runApply(options: { dryRun?: boolean; write?: boolean }): Promise<void> {
  if (!options.dryRun && !options.write) {
    console.log("Use --dry-run or --write");
    return;
  }
  const files = await writeClaudeFiles(process.cwd(), Boolean(options.dryRun) && !options.write);
  console.log(options.write ? "Applied files:" : "Planned files:");
  files.forEach((f) => console.log(`- ${f}`));
}
