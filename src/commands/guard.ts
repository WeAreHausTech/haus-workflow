/** `haus guard` — PreToolUse hook that blocks dangerous bash commands and sensitive file-access paths. */
import { readFileSync } from "node:fs";

import { DANGEROUS_COMMANDS } from "../security/dangerous-commands.js";
import { guardBash } from "../security/guard-bash.js";
import { guardFileAccess } from "../security/guard-file-access.js";
import { isRecord } from "../utils/audit-checks.js";
import { log } from "../utils/logger.js";

function stdin(): string {
  try {
    if (process.stdin.isTTY) return "";
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function deny(reason: string): void {
  log(JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: reason }));
}

/**
 * Reads a Claude Code hook payload from stdin and denies the tool call if it violates security rules.
 * Outputs a JSON `{ permissionDecision: "deny", ... }` response when blocking.
 */
export async function runGuard(kind: "file-access" | "bash", _options: { fromHook?: boolean }): Promise<void> {
  const raw = stdin();
  let payload: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) payload = parsed;
    } catch {
      deny("Malformed hook payload");
      process.exitCode = 1;
      return;
    }
  }
  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : {};

  if (kind === "file-access") {
    const candidate = String(toolInput.path ?? toolInput.file_path ?? "");
    if (guardFileAccess(candidate)) {
      deny(`Blocked sensitive path: ${candidate}`);
      process.exitCode = 1;
      return;
    }
    return;
  }
  const command = String(toolInput.command ?? "");
  if (guardBash(command) || DANGEROUS_COMMANDS.some((token) => command.includes(token))) {
    deny(`Blocked dangerous command: ${command}`);
    process.exitCode = 1;
  }
}
