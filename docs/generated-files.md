# Generated Files

## Project-root outputs

From `apply --write` / `init`:

- `./CLAUDE.md` — minimal root file with a `<!-- HAUS:BEGIN haus-imports v=1 -->` block that imports the two managed files below. User content outside the block is preserved across runs.

## `.haus-workflow` outputs

### Scanner and recommender

- `./.haus-workflow/context-map.json`
- `./.haus-workflow/dependency-map.json`
- `./.haus-workflow/scan-hashes.json`
- `./.haus-workflow/repo-summary.md`
- `./.haus-workflow/recommendation.json`

### Apply outputs

- `./.haus-workflow/selected-context.json`
- `./.haus-workflow/haus.lock.json`
- `./.haus-workflow/backups/haus.lock.<timestamp>.json`
- `./.haus-workflow/haus-way-of-work.md` — general Haus engineering rules (HAUS-MANAGED; skip-with-warn if user modified)
- `./.haus-workflow/project.md` — auto-generated project facts from context-map + recommendation (HAUS-MANAGED; always regenerated)

### Memory outputs

- `./.haus-workflow/memory/index.json`
- `./.haus-workflow/memory/project-learnings.md`
- `./.haus-workflow/memory/decisions.md`
- `./.haus-workflow/memory/recurring-issues.md`
- `./.haus-workflow/memory/client-context.md`

## `.claude` outputs

From `apply --write`:

- `./.claude/settings.json`
- `./.claude/rules/haus.md`
- `./.claude/rules/security.md`
- `./.claude/commands/haus-doctor.md`
- `./.claude/commands/haus-review.md`
- selected assets in `./.claude/skills` and `./.claude/agents`

## Overwrite behavior

- Generated writes are deterministic.
- Overwrite notices include path + diff line counts.
- Paths are printed repo-relative when possible.
- Update flow preserves lockfile backups before rewrite.
- HAUS-MANAGED files with user edits detected via content-hash mismatch; skipped with warning.
