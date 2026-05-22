# Plugin, Skills, and Hooks

## Plugin entrypoint

File: `plugin/.claude-plugin/plugin.json`

- declares plugin name/version and metadata (description, author, homepage, repository, license)
- skills are auto-discovered from `plugin/skills/*/SKILL.md` — no skills list in plugin.json

## Hook source of truth

File: `plugin/hooks/hooks.json`

- loaded by `src/claude/load-hooks.ts`
- validated with `zod`
- written to project `./.claude/settings.json` during apply

## Skills

Plugin skills live under `plugin/skills/*/SKILL.md`. Claude Code discovers them automatically when the plugin is installed; they are not listed in `plugin.json`.

Shipped skills:

- `haus-setup-project`
- `haus-context-router`
- `haus-workflow`
- `haus-global-engineering-rules`
- `haus-skill-author`
- `haus-documentation-maintainer`

These are authored guidance artifacts, not runtime code modules.

## Subagents

Plugin subagents live under `plugin/agents/*.md` and are discovered by Claude Code alongside skills. No local orchestration engine ships in this repo — subagent execution is provided by the Claude Code host.

Shipped subagents:

- `haus-code-reviewer`
- `haus-docs-researcher`
- `haus-planner`
- `haus-security-reviewer`
- `haus-test-reviewer`
