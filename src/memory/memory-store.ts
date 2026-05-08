import { readJson, readText, writeJson, writeText } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";

const FILES = ["project-learnings.md", "decisions.md", "recurring-issues.md", "client-context.md"] as const;

export async function ensureMemory(root: string): Promise<void> {
  await Promise.all(
    FILES.map(async (name) => {
      const file = hausPath(root, "memory", name);
      const current = await readText(file);
      if (!current) await writeText(file, `# ${name}\n`);
    })
  );
  const indexFile = hausPath(root, "memory", "index.json");
  const index = await readJson<Record<string, string[]>>(indexFile);
  if (!index) await writeJson(indexFile, { files: [...FILES] });
}

export async function readMemory(root: string): Promise<string> {
  await ensureMemory(root);
  const blocks = await Promise.all(FILES.map((name) => readText(hausPath(root, "memory", name))));
  return blocks.filter(Boolean).join("\n");
}

export async function appendLearning(root: string, line: string): Promise<void> {
  await ensureMemory(root);
  const file = hausPath(root, "memory", "project-learnings.md");
  const current = (await readText(file)) ?? "# project-learnings.md\n";
  await writeText(file, `${current}\n- ${line}\n`);
}
