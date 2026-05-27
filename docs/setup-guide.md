# Setup Guide

**New to the terminal?** Use the plain-language walkthrough: **[User guide](user-guide.md)** (install Haus, open your project, run setup, check health).

---

Run `haus setup-project`.

- Guided mode asks plain-language questions.
- Fast mode scans only.
- Review output, then approve `haus apply --write`.

## Local testing in Cursor (without Claude Code)

```bash
yarn build
node dist/cli.js scan --json
node dist/cli.js recommend --json
node dist/cli.js apply --dry-run
node dist/cli.js doctor
```

## Later testing in Claude Code

- Install CLI globally: `npm install -g @haus-tech/haus-workflow`
- Seed `~/.claude/` skills/agents/hooks: `haus install`
- In project run: `haus setup-project`
- Validate hooks and guardrails by opening `.claude/settings.json`.
