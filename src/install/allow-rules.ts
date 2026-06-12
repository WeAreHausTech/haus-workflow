/**
 * Derives Claude Code `permissions.allow` rule strings for haus's own CLI
 * subcommands, so a non-developer driving haus from the chat pane is not stopped
 * by an "Allow haus to run?" prompt on every step (WS6 — desktop UX).
 *
 * Deliberately SCOPED, not a blanket `Bash(haus:*)`: each known subcommand is
 * enumerated so a future/unknown haus subcommand still prompts. Syntax per
 * https://code.claude.com/docs/en/permissions.md — Bash uses prefix matching
 * (`Bash(haus doctor:*)`, the `:*` ≡ trailing ` *`).
 */

/** The haus subcommands an agent runs on the user's behalf during setup/health-check. */
const ALLOWED_SUBCOMMANDS = ['setup-project', 'apply', 'doctor', 'scan', 'recommend'] as const

/** Returns the deduped, scoped list of `permissions.allow` rule strings haus manages. */
export function buildAllowRules(): string[] {
  return [...new Set(ALLOWED_SUBCOMMANDS.map((sub) => `Bash(haus ${sub}:*)`))]
}
