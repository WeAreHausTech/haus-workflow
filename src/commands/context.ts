import { readText } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { readContextOrScan } from "../scanner/read-context.js";

export async function runContext(options: { task?: string; fromHook?: boolean }): Promise<void> {
  const root = process.cwd();
  const context = await readContextOrScan(root);
  const summary = (await readText(hausPath(root, "repo-summary.md"))) ?? "";
  const text = `# Haus Context
Task: ${options.task ?? "not provided"}
Roles: ${context.repoRoles.join(", ")}
Use minimal context.
${summary}`;
  console.log(options.fromHook ? text.slice(0, 3000) : text);
}
