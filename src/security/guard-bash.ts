/** Guard that blocks bash commands containing dangerous substrings. */

import { DANGEROUS_COMMANDS } from "./dangerous-commands.js";

/**
 * Returns a block message if `command` contains a dangerous token, otherwise `undefined`.
 * @param command - Raw bash command string to evaluate.
 */
export function guardBash(command: string): string | undefined {
  // Substring match — any dangerous token anywhere in the command triggers a block
  const matched = DANGEROUS_COMMANDS.find((token) => command.includes(token));
  if (matched) return `Blocked dangerous command: ${command}`;
  return undefined;
}
