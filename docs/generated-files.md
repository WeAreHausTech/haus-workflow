# Generated Files

## `.haus-workflow` outputs

Scanner and recommender outputs:

- `./.haus-workflow/context-map.json`
- `./.haus-workflow/dependency-map.json`
- `./.haus-workflow/scan-hashes.json`
- `./.haus-workflow/repo-summary.md`
- `./.haus-workflow/recommendation.json`

Apply/update outputs:

- `./.haus-workflow/selected-context.json`
- `./.haus-workflow/haus.lock.json`
- `./.haus-workflow/backups/haus.lock.<timestamp>.json`

Memory outputs:

- `./.haus-workflow/memory/index.json`
- `./.haus-workflow/memory/project-learnings.md`
- `./.haus-workflow/memory/decisions.md`
- `./.haus-workflow/memory/recurring-issues.md`
- `./.haus-workflow/memory/client-context.md`

## `.claude` outputs

From `apply --write`:

- `./.claude/CLAUDE.md`
- `./.claude/settings.json`
- `./.claude/rules/haus.md`
- `./.claude/rules/security.md`
- `./.claude/commands/haus-doctor.md`
- `./.claude/commands/haus-review.md`
- selected assets in `./.claude/skills` and `./.claude/agents`

## Overwrite behavior

- generated writes are deterministic
- overwrite notices include path + diff line counts
- paths are printed repo-relative when possible
- update flow preserves lockfile backups before rewrite
