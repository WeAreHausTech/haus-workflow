# Plugin

Plugin ships skills, agents, hooks.

Install locally:

```bash
haus plugin install
haus plugin validate
```

## Hook contract (SSOT)

[`plugin/hooks/hooks.json`](../plugin/hooks/hooks.json) is the **single source of truth** for which shell hooks run in Claude Code.

- `haus apply --write` loads that file from the installed `@haus/ai` package (strict: **throws** if missing or invalid) and writes the same object into `.claude/settings.json`, then **self-checks** the file on disk against the canonical JSON.
- `haus recommend` builds `.haus-ai/recommended-hooks.json` from the same source. By default it is also strict. For **local dev only**, set `HAUS_HOOKS_FALLBACK=1` to allow embedded defaults + warnings when the plugin file is absent (never use this for installs you ship).

`haus doctor` and `haus doctor --hooks` compare the project’s `.claude/settings.json` to the plugin contract; `--hooks` fails if settings are missing or drifted.

Hooks inject context, memory, and guardrails.
