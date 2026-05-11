# Plugin

Plugin ships skills, agents, hooks.

Install locally:

```bash
haus plugin install
haus plugin validate
```

## Hook contract (SSOT)

[`plugin/hooks/hooks.json`](../plugin/hooks/hooks.json) is the **single source of truth** for which shell hooks run in Claude Code.

- `haus apply --write` reads that file from the installed `@haus/ai` package and writes the same `hooks` object into `.claude/settings.json`.
- `haus recommend` builds `.haus-ai/recommended-hooks.json` by flattening the same file (stable `id` per known command).

If the file is missing from the pack, the CLI falls back to embedded defaults and prints a warning.

Hooks inject context, memory, and guardrails.
