/** Guard that hard-blocks bash commands containing deny-tier dangerous substrings. */

import { DENY_COMMANDS } from './dangerous-commands.js'

function matchesDenyToken(command: string, denyPhrase: string): boolean {
  if (denyPhrase === 'sudo') {
    return /(?:^|[|;&]\s*)sudo\b/i.test(command)
  }
  // Strip quote characters before matching so a deny-tier phrase split across
  // quotes (e.g. `--forc"e"`) still resolves to its unquoted form. This closes
  // the literal-quoting gap only — general shell obfuscation via $(...) or
  // variable indirection is a separate, harder problem this guard does not solve.
  const normalizedCommand = command
    .replace(/["'`]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return normalizedCommand.includes(denyPhrase.toLowerCase())
}

/**
 * Returns a block message if `command` contains a deny-tier dangerous token, otherwise `undefined`.
 * ASK_COMMANDS are not blocked here — they go through `permissions.ask` instead.
 * @param command - Raw bash command string to evaluate.
 */
export function guardBash(command: string): string | undefined {
  // Substring match — any deny-tier token anywhere in the command triggers a block
  const matched = DENY_COMMANDS.find((denyPhrase) => matchesDenyToken(command, denyPhrase))
  // Plain-language reason (non-devs hit these) that still names what was blocked.
  // No backticks: this string is emitted as a JSON permissionDecisionReason that the
  // UI may render as Markdown, so backticks in the command itself could break formatting.
  if (matched) return `I didn't run that — it can permanently change or delete things: ${command}`
  return undefined
}
