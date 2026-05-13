import { appendLearning, ensureMemory, readMemory } from "../memory/memory-store.js";
import { redactMemory } from "../memory/redact-memory.js";
import { log } from "../utils/logger.js";

export async function runMemory(
  subcommand: "status" | "add" | "inject" | "promote",
  options: { text?: string; task?: string; fromHook?: boolean },
): Promise<void> {
  const root = process.cwd();
  await ensureMemory(root);
  if (subcommand === "status") {
    log("Memory ready at .haus-ai/memory");
    return;
  }
  if (subcommand === "add") {
    if (!options.text) throw new Error("memory add requires text");
    await appendLearning(root, redactMemory(options.text));
    log("Memory added");
    return;
  }
  if (subcommand === "inject") {
    const text = redactMemory(await readMemory(root));
    if (!text.trim()) {
      log("No relevant Haus memory found.");
      return;
    }
    const compact = `Task: ${options.task ?? "n/a"}\n${text}`.slice(0, options.fromHook ? 1200 : 4000);
    log(compact);
    return;
  }
  log("Promotion proposal: review memory and move stable rules into .claude/rules manually.");
}
