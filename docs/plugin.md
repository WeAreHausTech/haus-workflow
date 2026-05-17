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

Plugin skills live under `plugin/skills/*/SKILL.md`.
These are authored guidance artifacts, not runtime code modules.

## Subagents

No dedicated subagent runtime framework is implemented in this repo.
Any subagent behavior comes from external host tooling, not from a local orchestration engine.
