import { appendLearning, ensureMemory, readMemory } from "../memory/memory-store.js";
import { redactMemory } from "../memory/redact-memory.js";

export async function runMemory(
  subcommand: "status" | "add" | "inject" | "promote",
  options: { text?: string; task?: string; fromHook?: boolean }
): Promise<void> {
  const root = process.cwd();
  await ensureMemory(root);
  if (subcommand === "status") {
    console.log("Memory ready at .haus-ai/memory");
    return;
  }
  if (subcommand === "add") {
    if (!options.text) throw new Error("memory add requires text");
    await appendLearning(root, redactMemory(options.text));
    console.log("Memory added");
    return;
  }
  if (subcommand === "inject") {
    const text = redactMemory(await readMemory(root));
    if (!text.trim()) {
      console.log("No relevant Haus memory found.");
      return;
    }
    const compact = `Task: ${options.task ?? "n/a"}\n${text}`.slice(0, options.fromHook ? 1200 : 4000);
    console.log(compact);
    return;
  }
  console.log("Promotion proposal: review memory and move stable rules into .claude/rules manually.");
}
