/** String tokens that the bash guard treats as dangerous and will block. */

/** Substrings matched (case-sensitive) against a full bash command string. */
export const DANGEROUS_COMMANDS = [
  'rm -rf',
  'sudo',
  'chmod -R 777',
  'chown -R',
  'git push --force',
  'git reset --hard',
  'docker system prune',
  'drop database',
  'truncate table',
  'php artisan migrate --force',
  'npm publish',
  'yarn npm publish',
  'pnpm publish',
]
