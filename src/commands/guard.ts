import { DANGEROUS_COMMANDS } from "../security/dangerous-commands.js";
import { SENSITIVE_PATHS } from "../security/sensitive-paths.js";
import { readFileSync } from "node:fs";

function stdin(): string {
  try {
    if (process.stdin.isTTY) return "";
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function deny(reason: string): void {
  console.log(JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: reason }));
}

export async function runGuard(kind: "file-access" | "bash", _options: { fromHook?: boolean }): Promise<void> {
  const raw = stdin();
  const payload = raw ? JSON.parse(raw) : {};
  const toolInput = payload.tool_input ?? {};

  if (kind === "file-access") {
    const candidate = String(toolInput.path ?? toolInput.file_path ?? "");
    if (SENSITIVE_PATHS.some((token) => candidate.includes(token.replace("*", "")))) {
      deny(`Blocked sensitive path: ${candidate}`);
      process.exitCode = 1;
      return;
    }
    return;
  }
  const command = String(toolInput.command ?? "");
  if (DANGEROUS_COMMANDS.some((token) => command.includes(token))) {
    deny(`Blocked dangerous command: ${command}`);
    process.exitCode = 1;
  }
}
