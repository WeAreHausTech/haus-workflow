/**
 * Per-project memory store at .haus-workflow/memory/ — persists learnings, decisions,
 * recurring issues, and client context across Claude Code sessions.
 */

import { readJson, readText, writeJson, writeText } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";

/** Ordered list of memory files maintained for every project. */
const FILES = ["project-learnings.md", "decisions.md", "recurring-issues.md", "client-context.md"] as const;

/**
 * Creates any missing memory files and the index.json for the project.
 * Safe to call repeatedly — skips files that already exist.
 * @param root - Absolute path to the project root.
 */
export async function ensureMemory(root: string): Promise<void> {
  await Promise.all(
    FILES.map(async (name) => {
      const file = hausPath(root, "memory", name);
      const current = await readText(file);
      if (!current) await writeText(file, `# ${name}\n`);
    }),
  );
  const indexFile = hausPath(root, "memory", "index.json");
  const index = await readJson<Record<string, string[]>>(indexFile);
  if (!index) await writeJson(indexFile, { files: [...FILES] });
}

/**
 * Returns all memory file contents concatenated into a single string, suitable for injection into context.
 * @param root - Absolute path to the project root.
 */
export async function readMemory(root: string): Promise<string> {
  await ensureMemory(root);
  const blocks = await Promise.all(FILES.map((name) => readText(hausPath(root, "memory", name))));
  return blocks.filter(Boolean).join("\n");
}

/**
 * Appends a single learning bullet to project-learnings.md.
 * @param root - Absolute path to the project root.
 * @param line - The learning text to append (without leading "- ").
 */
export async function appendLearning(root: string, line: string): Promise<void> {
  await ensureMemory(root);
  const file = hausPath(root, "memory", "project-learnings.md");
  const current = (await readText(file)) ?? "# project-learnings.md\n";
  await writeText(file, `${current}\n- ${line}\n`);
}
