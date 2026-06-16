/**
 * String tokens the bash guard and permissions layers treat as dangerous.
 * DENY_COMMANDS → hard block (guard + permissions.deny).
 * ASK_COMMANDS  → prompt user before running (permissions.ask only; guard does not block).
 */

/** Hard-deny: substrings that the bash guard hard-blocks. */
export const DENY_COMMANDS = [
  'sudo',
  'chmod -R 777',
  'git push --force',
  'git push --force-with-lease',
  'git push -f',
  'drop database',
  'truncate table',
  'npm publish',
  'yarn npm publish',
  'pnpm publish',
]

/** Ask-tier: substrings that Claude must ask the user about before running. */
export const ASK_COMMANDS = [
  'rm -rf',
  'chown -R',
  'git reset --hard',
  'docker system prune',
  'php artisan migrate --force',
]
