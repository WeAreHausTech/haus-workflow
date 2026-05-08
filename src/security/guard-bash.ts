import { DANGEROUS_COMMANDS } from "./dangerous-commands.js";

export function guardBash(command: string): string | undefined {
  const matched = DANGEROUS_COMMANDS.find((token) => command.includes(token));
  if (matched) return `Blocked dangerous command: ${command}`;
  return undefined;
}
