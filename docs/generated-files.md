# Generated Files

## `.haus-ai` outputs

Scanner and recommender outputs:

- `./.haus-ai/context-map.json`
- `./.haus-ai/dependency-map.json`
- `./.haus-ai/scan-hashes.json`
- `./.haus-ai/repo-summary.md`
- `./.haus-ai/recommendation.json`

Apply/update outputs:

- `./.haus-ai/selected-context.json`
- `./.haus-ai/haus.lock.json`
- `./.haus-ai/backups/haus.lock.<timestamp>.json`

Memory outputs:

- `./.haus-ai/memory/index.json`
- `./.haus-ai/memory/project-learnings.md`
- `./.haus-ai/memory/decisions.md`
- `./.haus-ai/memory/recurring-issues.md`
- `./.haus-ai/memory/client-context.md`

## `.claude` outputs

From `apply --write`:

- `./.claude/CLAUDE.md`
- `./.claude/settings.json`
- `./.claude/rules/haus.md`
- `./.claude/rules/security.md`
- `./.claude/commands/haus-doctor.md`
- `./.claude/commands/haus-review.md`
- `./.claude/commands/haus-explain-context.md`
- selected assets in `./.claude/skills` and `./.claude/agents`

## Overwrite behavior

- generated writes are deterministic
- overwrite notices include path + diff line counts
- paths are printed repo-relative when possible
- update flow preserves lockfile backups before rewrite
