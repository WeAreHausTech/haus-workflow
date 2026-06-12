/**
 * Derives Claude Code `permissions.ask` rule strings from the ask-tier lists.
 * Ask rules prompt the user before Claude executes the operation — they do not
 * hard-block. The hook-time guards only block deny-tier items; ask-tier items
 * pass the hook and are gated by the settings.json ask array.
 *
 * Syntax mirrors deny-rules.ts:
 *   - Bash uses prefix matching: `Bash(rm -rf:*)`.
 *   - File tools use gitignore globs: `Edit(.env)`, `Write(storage/logs/**)`.
 */
import { ASK_COMMANDS } from './dangerous-commands.js'
import { ASK_PATHS } from './sensitive-paths.js'

/**
 * Returns the deduped list of `permissions.ask` rule strings haus manages:
 * one Bash prefix-ask per ask-tier command, plus per-tool asks for every
 * ask-tier path (each entry specifies which tools require a prompt).
 */
export function buildAskRules(): string[] {
  const rules: string[] = []

  for (const command of ASK_COMMANDS) {
    rules.push(`Bash(${command}:*)`)
  }

  for (const { pattern, tools } of ASK_PATHS) {
    for (const tool of tools) {
      rules.push(`${tool}(${pattern})`)
    }
  }

  return [...new Set(rules)]
}
